'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  calculateExternalPayroll,
  formatMoney,
  formatMinutesSigned,
  groupDaysByEmployee,
  inferDayHours,
  payrollMonthLabel,
  uniquePeople,
} from '@/lib/attendance/external-payroll';

const READY_IMPORT_STATUSES=['recalculated','ready_to_post'];

function dateOnly(value){ return value ? String(value).slice(0,10) : ''; }
function clientKeyOf(item){
  if(item?.client_entity_id) return `entity:${item.client_entity_id}`;
  return `name:${String(item?.client_name_snapshot || 'external-client').trim().toLowerCase().replace(/\s+/g,' ')}`;
}
function numberOrNull(value){
  if(value==='' || value==null) return null;
  const n=Number(value);
  return Number.isFinite(n) && n>=0 ? n : null;
}
function cellText(cell){
  const value=cell?.value;
  if(value==null) return '';
  if(typeof value==='object' && value.text!=null) return String(value.text).trim();
  if(typeof value==='object' && value.result!=null) return String(value.result).trim();
  return String(value).trim();
}
function paymentValue(value){
  const text=String(value||'').trim();
  const match=PAYMENT_METHODS.find(([key,label])=>text===key || text===label);
  return match?.[0] || null;
}
function safePart(value){ return encodeURIComponent(String(value||'client')).replace(/%/g,'_'); }
function downloadBuffer(buffer,filename){
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

export default function ExternalPayrollWorkspace(){
  const [imports,setImports]=useState([]);
  const [activeId,setActiveId]=useState('');
  const [days,setDays]=useState([]);
  const [batch,setBatch]=useState(null);
  const [lines,setLines]=useState([]);
  const [profiles,setProfiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const [expanded,setExpanded]=useState('');
  const [editKey,setEditKey]=useState('');
  const [profileDraft,setProfileDraft]=useState(null);
  const salaryFileRef=useRef(null);
  const letterheadRef=useRef(null);

  const activeImport=useMemo(()=>imports.find((item)=>item.id===activeId)||null,[imports,activeId]);
  const people=useMemo(()=>uniquePeople(days),[days]);
  const daysByKey=useMemo(()=>groupDaysByEmployee(days),[days]);
  const profileByKey=useMemo(()=>new Map(profiles.map((p)=>[p.source_employee_key,p])),[profiles]);
  const lineByKey=useMemo(()=>new Map(lines.map((l)=>[l.source_employee_key,l])),[lines]);
  const salaryReadyCount=useMemo(()=>lines.filter((line)=>numberOrNull(line.reference_net_salary)!==null).length,[lines]);
  const salaryMissingCount=Math.max(0,people.length-salaryReadyCount);

  async function loadImports(){
    const q=await supabase.from('hr_attendance_imports')
      .select('id,period_from,period_to,status,processing_scope,client_entity_id,client_name_snapshot,client_reference,uploaded_at')
      .eq('processing_scope','external')
      .in('status',READY_IMPORT_STATUSES)
      .order('uploaded_at',{ascending:false})
      .limit(30);
    if(q.error){setErr(q.error.message);return;}
    const list=q.data||[];
    setImports(list);
    setActiveId((current)=>current&&list.some((x)=>x.id===current)?current:(list[0]?.id||''));
  }

  async function ensureWorkspace(item,sourceDays){
    if(!item)return;
    const clientKey=clientKeyOf(item);
    let currentBatch=null;
    const existing=await supabase.from('hr_external_payroll_batches').select('*').eq('attendance_import_id',item.id).maybeSingle();
    if(existing.error)throw existing.error;
    currentBatch=existing.data;

    if(!currentBatch){
      const previous=await supabase.from('hr_external_payroll_batches').select('*').eq('client_key',clientKey).order('created_at',{ascending:false}).limit(1).maybeSingle();
      const settings=await supabase.from('hr_attendance_settings').select('missing_punch_deduction_days').eq('id',1).maybeSingle();
      const seed={
        attendance_import_id:item.id,
        client_key:clientKey,
        divisor_policy:previous.data?.divisor_policy||'thirty',
        positive_time_policy:previous.data?.positive_time_policy||'pay_net',
        missing_punch_deduction_days:previous.data?.missing_punch_deduction_days??settings.data?.missing_punch_deduction_days??0.25,
        default_payment_method:previous.data?.default_payment_method||null,
        client_letterhead_path:previous.data?.client_letterhead_path||null,
      };
      const created=await supabase.from('hr_external_payroll_batches').insert(seed).select('*').single();
      if(created.error)throw created.error;
      currentBatch=created.data;
    }

    const persons=uniquePeople(sourceDays);
    const keys=persons.map((p)=>p.key);
    let currentProfiles=[];
    if(keys.length){
      const pq=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',clientKey).in('source_employee_key',keys);
      if(pq.error)throw pq.error;
      currentProfiles=pq.data||[];
      const existingKeys=new Set(currentProfiles.map((p)=>p.source_employee_key));
      const missing=persons.filter((p)=>!existingKeys.has(p.key)).map((p)=>({
        client_key:clientKey,
        source_employee_key:p.key,
        source_employee_no:p.no||null,
        source_employee_name:p.name||null,
        display_employee_no:p.no||null,
        display_name:p.name||'غير معروف',
      }));
      if(missing.length){
        const iq=await supabase.from('hr_client_external_employee_profiles').insert(missing).select('*');
        if(iq.error)throw iq.error;
        currentProfiles=[...currentProfiles,...(iq.data||[])];
      }
    }

    const lq=await supabase.from('hr_external_payroll_lines').select('*').eq('payroll_batch_id',currentBatch.id);
    if(lq.error)throw lq.error;
    let currentLines=lq.data||[];
    const existingLineKeys=new Set(currentLines.map((line)=>line.source_employee_key));
    const profileMap=new Map(currentProfiles.map((p)=>[p.source_employee_key,p]));
    const missingLines=persons.filter((p)=>!existingLineKeys.has(p.key)).map((p)=>({
      payroll_batch_id:currentBatch.id,
      external_person_id:p.externalPersonId,
      source_employee_key:p.key,
      payment_method:profileMap.get(p.key)?.default_payment_method||currentBatch.default_payment_method||null,
    }));
    if(missingLines.length){
      const iq=await supabase.from('hr_external_payroll_lines').insert(missingLines).select('*');
      if(iq.error)throw iq.error;
      currentLines=[...currentLines,...(iq.data||[])];
    }

    setBatch(currentBatch);
    setProfiles(currentProfiles);
    setLines(currentLines);
  }

  async function loadActive(id){
    const item=imports.find((x)=>x.id===id);
    if(!item)return;
    setBusy(true);setErr('');setMsg('');setBatch(null);setLines([]);setProfiles([]);setDirty(false);
    try{
      const q=await supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',id).order('subject_name').order('work_date');
      if(q.error)throw q.error;
      const source=q.data||[];
      setDays(source);
      await ensureWorkspace(item,source);
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  useEffect(()=>{loadImports();},[]);
  useEffect(()=>{if(activeId&&imports.length)loadActive(activeId);},[activeId,imports.length]);

  function setBatchField(field,value){setBatch((current)=>({...current,[field]:value}));setDirty(true);}
  function setLineField(id,field,value){setLines((list)=>list.map((line)=>line.id===id?{...line,[field]:value}:line));setDirty(true);}

  async function saveInputs(showMessage=true){
    if(!batch)return false;
    setBusy(true);setErr('');if(showMessage)setMsg('');
    try{
      const bq=await supabase.from('hr_external_payroll_batches').update({
        divisor_policy:batch.divisor_policy,
        positive_time_policy:batch.positive_time_policy,
        missing_punch_deduction_days:Number(batch.missing_punch_deduction_days||0),
        default_payment_method:batch.default_payment_method||null,
        client_letterhead_path:batch.client_letterhead_path||null,
        status:batch.status==='final'?'final':'draft',
        updated_at:new Date().toISOString(),
      }).eq('id',batch.id);
      if(bq.error)throw bq.error;

      for(const line of lines){
        const q=await supabase.from('hr_external_payroll_lines').update({
          reference_net_salary:numberOrNull(line.reference_net_salary),
          basic_salary:numberOrNull(line.basic_salary),
          housing_allowance:numberOrNull(line.housing_allowance),
          transport_allowance:numberOrNull(line.transport_allowance),
          other_allowances:numberOrNull(line.other_allowances),
          manual_additions:Number(line.manual_additions||0),
          manual_additions_reason:line.manual_additions_reason||null,
          manual_deductions:Number(line.manual_deductions||0),
          manual_deductions_reason:line.manual_deductions_reason||null,
          payment_method:line.payment_method||null,
          day_hours_override:numberOrNull(line.day_hours_override),
          show_job_title:!!line.show_job_title,
          show_identity:!!line.show_identity,
          updated_at:new Date().toISOString(),
        }).eq('id',line.id);
        if(q.error)throw q.error;
      }
      setDirty(false);
      if(showMessage)setMsg('تم حفظ بيانات الرواتب المدخلة.');
      setBusy(false);
      return true;
    }catch(e){setErr(e.message||String(e));setBusy(false);return false;}
  }

  function openProfile(key){
    const profile=profileByKey.get(key);
    const line=lineByKey.get(key);
    if(!profile||!line)return;
    setEditKey(key);
    setProfileDraft({...profile,
      show_job_title:!!line.show_job_title,
      show_identity:!!line.show_identity,
      manual_additions:line.manual_additions??0,
      manual_additions_reason:line.manual_additions_reason||'',
      manual_deductions:line.manual_deductions??0,
      manual_deductions_reason:line.manual_deductions_reason||'',
    });
  }

  async function saveProfile(){
    const draft=profileDraft;
    const line=lineByKey.get(editKey);
    if(!draft||!line)return;
    if(!String(draft.display_name||'').trim()){setErr('اسم الموظف المعتمد مطلوب.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const pq=await supabase.from('hr_client_external_employee_profiles').update({
        display_employee_no:String(draft.display_employee_no||'').trim()||null,
        display_name:String(draft.display_name||'').trim(),
        job_title:String(draft.job_title||'').trim()||null,
        identity_no:String(draft.identity_no||'').trim()||null,
        default_payment_method:draft.default_payment_method||null,
        updated_at:new Date().toISOString(),
      }).eq('id',draft.id).select('*').single();
      if(pq.error)throw pq.error;
      const lq=await supabase.from('hr_external_payroll_lines').update({
        show_job_title:!!draft.show_job_title,
        show_identity:!!draft.show_identity,
        manual_additions:Number(draft.manual_additions||0),
        manual_additions_reason:String(draft.manual_additions_reason||'').trim()||null,
        manual_deductions:Number(draft.manual_deductions||0),
        manual_deductions_reason:String(draft.manual_deductions_reason||'').trim()||null,
        updated_at:new Date().toISOString(),
      }).eq('id',line.id).select('*').single();
      if(lq.error)throw lq.error;
      setProfiles((list)=>list.map((p)=>p.id===draft.id?pq.data:p));
      setLines((list)=>list.map((item)=>item.id===line.id?lq.data:item));
      setEditKey('');setProfileDraft(null);setDirty(false);setMsg('تم حفظ البيانات الإضافية للموظف.');
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  async function exportSalaryTemplate(){
    if(!activeImport)return;
    setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');
      const wb=new ExcelJS.Workbook();
      const ws=wb.addWorksheet('بيانات الرواتب',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:16},
        {header:'اسم الموظف',key:'name',width:30},
        {header:'صافي الراتب المرجعي',key:'net',width:20},
        {header:'الراتب الأساسي',key:'basic',width:18},
        {header:'بدل السكن',key:'housing',width:16},
        {header:'بدل النقل',key:'transport',width:16},
        {header:'بدلات أخرى',key:'other',width:16},
        {header:'ساعات اليوم',key:'hours',width:14},
        {header:'طريقة الدفع',key:'payment',width:22},
        {header:'المسمى الوظيفي',key:'job',width:24},
        {header:'الهوية / الإقامة',key:'identity',width:20},
        {header:'إضافة أخرى',key:'addition',width:15},
        {header:'سبب الإضافة',key:'addition_reason',width:28},
        {header:'خصم آخر',key:'deduction',width:15},
        {header:'سبب الخصم',key:'deduction_reason',width:28},
        {header:'__source_key',key:'source',hidden:true,width:10},
      ];
      people.forEach((person)=>{
        const profile=profileByKey.get(person.key)||{};
        const line=lineByKey.get(person.key)||{};
        ws.addRow({
          no:profile.display_employee_no||person.no,
          name:profile.display_name||person.name,
          net:line.reference_net_salary??'',
          basic:line.basic_salary??'',
          housing:line.housing_allowance??'',
          transport:line.transport_allowance??'',
          other:line.other_allowances??'',
          hours:line.day_hours_override??'',
          payment:PAYMENT_METHOD_LABEL[line.payment_method||profile.default_payment_method||batch?.default_payment_method]||'',
          job:profile.job_title||'',
          identity:profile.identity_no||'',
          addition:Number(line.manual_additions||0)||'',
          addition_reason:line.manual_additions_reason||'',
          deduction:Number(line.manual_deductions||0)||'',
          deduction_reason:line.manual_deductions_reason||'',
          source:person.key,
        });
      });
      ws.getRow(1).height=30;
      ws.getRow(1).eachCell((cell)=>{
        cell.font={bold:true,color:{argb:'FFFFFFFF'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};
        cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      });
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:15}};
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r);
        row.height=25;
        row.getCell(9).dataValidation={type:'list',allowBlank:true,formulae:['"حماية الأجور – مدد,تحويل بنكي,نقدًا"']};
        row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};
        row.getCell(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};
      }
      const info=wb.addWorksheet('إرشادات');
      info.views=[{rightToLeft:true}];
      info.getColumn(1).width=110;
      info.getCell('A1').value='نموذج تجهيز بيانات الرواتب';
      info.getCell('A1').font={bold:true,size:16};
      info.getCell('A3').value='رقم الموظف واسمه مأخوذان من دفعة الحضور الحالية. املأ بيانات الراتب ثم ارفع الملف من شاشة معالجة الرواتب.';
      info.getCell('A4').value='صافي الراتب المرجعي هو صافي راتب الموظف عند عدم وجود غياب أو خصم حضور، وهو الحقل الأساسي المطلوب للاحتساب.';
      info.getCell('A5').value='يمكن ترك الحقول غير المطلوبة فارغة. لا تحذف العمود التقني المخفي لأنه يحافظ على الربط الصحيح بالموظف.';
      const buffer=await wb.xlsx.writeBuffer();
      downloadBuffer(buffer,`نموذج_بيانات_الرواتب_${activeImport.client_name_snapshot||'العميل'}_${dateOnly(activeImport.period_from)}.xlsx`);
      setMsg('تم تنزيل نموذج الرواتب بأسماء الموظفين وأرقامهم من دفعة الحضور الحالية.');
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  async function importSalaryFile(file){
    if(!file||!batch)return;
    setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');
      const wb=new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws=wb.getWorksheet('بيانات الرواتب')||wb.worksheets[0];
      if(!ws)throw new Error('ملف الرواتب لا يحتوي ورقة بيانات.');
      const expected=['رقم الموظف','اسم الموظف','صافي الراتب المرجعي','الراتب الأساسي','بدل السكن','بدل النقل','بدلات أخرى','ساعات اليوم','طريقة الدفع','المسمى الوظيفي','الهوية / الإقامة','إضافة أخرى','سبب الإضافة','خصم آخر','سبب الخصم','__source_key'];
      expected.forEach((label,index)=>{
        if(cellText(ws.getRow(1).getCell(index+1))!==label)throw new Error('بنية ملف الرواتب تغيرت. استخدم النموذج الصادر من البرنامج.');
      });
      let changed=0;
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r);
        const key=cellText(row.getCell(16));
        if(!key)continue;
        const line=lineByKey.get(key);
        const profile=profileByKey.get(key);
        if(!line||!profile)continue;
        const payment=paymentValue(cellText(row.getCell(9)));
        const pq=await supabase.from('hr_client_external_employee_profiles').update({
          display_employee_no:cellText(row.getCell(1))||profile.display_employee_no||null,
          display_name:cellText(row.getCell(2))||profile.display_name,
          job_title:cellText(row.getCell(10))||null,
          identity_no:cellText(row.getCell(11))||null,
          default_payment_method:payment||profile.default_payment_method||null,
          updated_at:new Date().toISOString(),
        }).eq('id',profile.id);
        if(pq.error)throw pq.error;
        const lq=await supabase.from('hr_external_payroll_lines').update({
          reference_net_salary:numberOrNull(cellText(row.getCell(3))),
          basic_salary:numberOrNull(cellText(row.getCell(4))),
          housing_allowance:numberOrNull(cellText(row.getCell(5))),
          transport_allowance:numberOrNull(cellText(row.getCell(6))),
          other_allowances:numberOrNull(cellText(row.getCell(7))),
          day_hours_override:numberOrNull(cellText(row.getCell(8))),
          payment_method:payment||line.payment_method||null,
          manual_additions:Number(numberOrNull(cellText(row.getCell(12)))||0),
          manual_additions_reason:cellText(row.getCell(13))||null,
          manual_deductions:Number(numberOrNull(cellText(row.getCell(14)))||0),
          manual_deductions_reason:cellText(row.getCell(15))||null,
          updated_at:new Date().toISOString(),
        }).eq('id',line.id);
        if(lq.error)throw lq.error;
        changed++;
      }
      await loadActive(activeId);
      setMsg(`تم استيراد بيانات الرواتب لـ ${changed} موظف.`);
    }catch(e){setErr(e.message||String(e));setBusy(false);}
    if(salaryFileRef.current)salaryFileRef.current.value='';
  }

  async function uploadLetterhead(file){
    if(!file||!batch)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setErr('مطبوعات العميل يجب أن تكون صورة PNG أو JPG أو WEBP عالية الجودة.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const ext=(file.name.split('.').pop()||'png').toLowerCase();
      const path=`external-payroll/${safePart(batch.client_key)}/letterhead-${Date.now()}.${ext}`;
      const up=await supabase.storage.from('brand').upload(path,file,{cacheControl:'31536000',upsert:false,contentType:file.type});
      if(up.error)throw up.error;
      const q=await supabase.from('hr_external_payroll_batches').update({client_letterhead_path:path,updated_at:new Date().toISOString()}).eq('id',batch.id).select('*').single();
      if(q.error)throw q.error;
      setBatch(q.data);
      setMsg('تم اعتماد مطبوعات العميل لهذه الدفعة دون ضغط الصورة أو خفض جودتها.');
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
    if(letterheadRef.current)letterheadRef.current.value='';
  }

  async function calculateAll(){
    if(!batch||!activeImport)return;
    if(salaryMissingCount>0){setErr(`أكمل صافي الراتب المرجعي لـ ${salaryMissingCount} موظف قبل الاحتساب.`);return;}
    const saved=dirty?await saveInputs(false):true;
    if(!saved)return;
    setBusy(true);setErr('');setMsg('');
    let completed=0;
    const incomplete=[];
    const refreshedLines=[];
    try{
      for(const line of lines){
        const profile=profileByKey.get(line.source_employee_key)||{};
        const calc=calculateExternalPayroll({
          days:daysByKey.get(line.source_employee_key)||[],
          line,
          batch,
          profile,
          periodFrom:activeImport.period_from,
          periodTo:activeImport.period_to,
        });
        if(!calc.ready){
          incomplete.push(`${profile.display_name||profile.source_employee_name||line.source_employee_key}: ${calc.reason}`);
          refreshedLines.push(line);
          continue;
        }
        const q=await supabase.from('hr_external_payroll_lines').update({
          payment_method:calc.paymentMethod,
          calculated_divisor_days:calc.divisorDays,
          calculated_day_hours:calc.dayHours,
          calculated_day_value:calc.dayValue,
          calculated_hour_value:calc.hourValue,
          calculated_absence_days:calc.absenceDays,
          calculated_missing_punch_days:calc.missingPunchDays,
          calculated_missing_in_count:calc.missingInCount,
          calculated_missing_out_count:calc.missingOutCount,
          calculated_extra_minutes:calc.extraMinutes,
          calculated_short_minutes:calc.shortMinutes,
          calculated_net_minutes:calc.netMinutes,
          calculated_absence_amount:calc.absenceAmount,
          calculated_missing_punch_amount:calc.missingPunchAmount,
          calculated_time_amount:calc.timeAmount,
          calculated_total_additions:calc.totalAdditions,
          calculated_total_deductions:calc.totalDeductions,
          calculated_final_net_salary:calc.finalNetSalary,
          calculation_snapshot:calc.snapshot,
          calculated_at:new Date().toISOString(),
          updated_at:new Date().toISOString(),
        }).eq('id',line.id).select('*').single();
        if(q.error)throw q.error;
        refreshedLines.push(q.data);
        completed++;
      }
      const status=incomplete.length?'draft':'calculated';
      const bq=await supabase.from('hr_external_payroll_batches').update({status,updated_at:new Date().toISOString()}).eq('id',batch.id).select('*').single();
      if(bq.error)throw bq.error;
      setBatch(bq.data);
      setLines(refreshedLines);
      if(incomplete.length)setErr(`تم احتساب ${completed} موظف. يتبقى ${incomplete.length}: ${incomplete.slice(0,4).join(' | ')}`);
      else setMsg(`اكتمل احتساب ${completed} موظف. قسائم الرواتب جاهزة للإصدار.`);
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  const totals=useMemo(()=>lines.reduce((acc,line)=>{
    acc.reference+=Number(line.reference_net_salary||0);
    acc.additions+=Number(line.calculated_total_additions||0);
    acc.deductions+=Number(line.calculated_total_deductions||0);
    acc.final+=Number(line.calculated_final_net_salary||0);
    return acc;
  },{reference:0,additions:0,deductions:0,final:0}),[lines]);

  return <div>
    <div className="page-head">
      <div><h1>معالجة الرواتب</h1><p>أولًا جهّز بيانات الرواتب، ثم طبّق نتيجة الحضور واصدر قسائم الموظفين.</p></div>
      <Link className="btn ghost" href="/dashboard/attendance/external-review">مراجعة التبريرات</Link>
    </div>
    {err&&<div className="msg err" style={{marginTop:14}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginTop:14}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}>
      <header><h2>دفعة الرواتب</h2><span className="hint">تظهر الدفعات التي اكتملت مراجعتها وإعادة احتساب الحضور.</span></header>
      <div style={{padding:18}}>
        <div className="field"><label>العميل والفترة</label><select value={activeId} onChange={(e)=>setActiveId(e.target.value)} disabled={busy}>{!imports.length&&<option value="">لا توجد دفعات جاهزة</option>}{imports.map((item)=><option key={item.id} value={item.id}>{item.client_name_snapshot||'عميل خارجي'} — {dateOnly(item.period_from)} إلى {dateOnly(item.period_to)}</option>)}</select></div>
        {activeImport&&<div className="stat-grid" style={{marginTop:14}}>
          <div className="stat"><span>شهر الرواتب</span><strong>{payrollMonthLabel(activeImport.period_from)}</strong></div>
          <div className="stat"><span>الموظفون</span><strong>{people.length}</strong></div>
          <div className="stat"><span>بيانات الراتب مكتملة</span><strong>{salaryReadyCount} / {people.length}</strong></div>
          <div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div>
        </div>}
      </div>
    </div>

    {batch&&<>
      <div className="section">
        <header><h2>1 — تجهيز بيانات الرواتب</h2><span className="hint">اختر الطريقة الأسرع: نموذج Excel جاهز بالأسماء والأرقام، أو إدخال مباشر من الورقة أمامك.</span></header>
        <div style={{padding:18}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12,marginBottom:16}}>
            <div style={{border:'1px solid rgba(148,163,184,.28)',borderRadius:12,padding:14}}>
              <strong>الطريقة الأولى — Excel</strong>
              <p className="hint" style={{margin:'7px 0 12px'}}>البرنامج يضع أسماء الموظفين وأرقامهم تلقائيًا. أنت تملأ بيانات الراتب وترفع الملف.</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button className="btn ghost" disabled={busy} onClick={exportSalaryTemplate}>تنزيل نموذج الرواتب</button>
                <button className="btn" disabled={busy} onClick={()=>salaryFileRef.current?.click()}>رفع النموذج بعد تعبئته</button>
                <input ref={salaryFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importSalaryFile(e.target.files?.[0])}/>
              </div>
            </div>
            <div style={{border:'1px solid rgba(148,163,184,.28)',borderRadius:12,padding:14}}>
              <strong>الطريقة الثانية — إدخال سريع</strong>
              <p className="hint" style={{margin:'7px 0 12px'}}>إذا كانت البيانات أمامك على ورقة، اكتبها مباشرة في الجدول أدناه ثم اضغط حفظ.</p>
              <button className="btn" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ الإدخال المباشر</button>
            </div>
          </div>

          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>الرقم الوظيفي</th><th>الموظف</th><th>صافي الراتب المرجعي *</th><th>الأساسي</th><th>السكن</th><th>النقل</th><th>بدلات أخرى</th><th>ساعات اليوم</th><th>طريقة الدفع</th><th>بيانات إضافية</th></tr></thead>
              <tbody>{people.map((person)=>{
                const line=lineByKey.get(person.key);
                const profile=profileByKey.get(person.key);
                if(!line||!profile)return null;
                const inferred=inferDayHours(daysByKey.get(person.key)||[]);
                return <tr key={person.key}>
                  <td><strong>{profile.display_employee_no||person.no||'—'}</strong></td>
                  <td><strong>{profile.display_name||person.name}</strong>{profile.display_name!==profile.source_employee_name&&profile.source_employee_name?<div className="hint">المصدر: {profile.source_employee_name}</div>:null}</td>
                  <td><input type="number" min="0" step="0.01" value={line.reference_net_salary??''} onChange={(e)=>setLineField(line.id,'reference_net_salary',e.target.value)} style={{minWidth:125}}/></td>
                  <td><input type="number" min="0" step="0.01" value={line.basic_salary??''} onChange={(e)=>setLineField(line.id,'basic_salary',e.target.value)} style={{minWidth:105}}/></td>
                  <td><input type="number" min="0" step="0.01" value={line.housing_allowance??''} onChange={(e)=>setLineField(line.id,'housing_allowance',e.target.value)} style={{minWidth:95}}/></td>
                  <td><input type="number" min="0" step="0.01" value={line.transport_allowance??''} onChange={(e)=>setLineField(line.id,'transport_allowance',e.target.value)} style={{minWidth:95}}/></td>
                  <td><input type="number" min="0" step="0.01" value={line.other_allowances??''} onChange={(e)=>setLineField(line.id,'other_allowances',e.target.value)} style={{minWidth:105}}/></td>
                  <td><input type="number" min="0.5" step="0.25" placeholder={inferred?String(inferred):'—'} value={line.day_hours_override??''} onChange={(e)=>setLineField(line.id,'day_hours_override',e.target.value)} style={{minWidth:88}}/><div className="hint">{line.day_hours_override?'يدوي':inferred?`مستنتج: ${inferred}`:'غير محدد'}</div></td>
                  <td><select value={line.payment_method||''} onChange={(e)=>setLineField(line.id,'payment_method',e.target.value||null)} style={{minWidth:145}}><option value="">{batch.default_payment_method?`افتراضي: ${PAYMENT_METHOD_LABEL[batch.default_payment_method]}`:'اختر'}</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
                  <td><button className="btn ghost" onClick={()=>openProfile(person.key)}>فتح</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="rowsplit" style={{marginTop:14,alignItems:'center'}}>
            <span className="hint">* صافي الراتب المرجعي هو المطلوب للاحتساب. باقي المكونات يمكن تعبئتها حسب حاجة القسيمة.</span>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>{salaryMissingCount>0?<strong style={{color:'#8B2E2E'}}>متبقي {salaryMissingCount} موظف</strong>:<strong>بيانات الرواتب الأساسية مكتملة</strong>}<button className="btn" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ الكل</button></div>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>2 — سياسة الاحتساب</h2><span className="hint">تطبق على هذه الدفعة بعد تجهيز بيانات الرواتب.</span></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            <div className="field"><label>قسمة صافي الراتب</label><select value={batch.divisor_policy} onChange={(e)=>setBatchField('divisor_policy',e.target.value)}><option value="thirty">30 يومًا</option><option value="calendar_days">أيام الشهر التقويمية</option></select></div>
            <div className="field"><label>صافي الساعات الزائدة</label><select value={batch.positive_time_policy} onChange={(e)=>setBatchField('positive_time_policy',e.target.value)}><option value="pay_net">تضاف قيمتها للمستحق</option><option value="offset_only">تعوض النقص فقط</option></select></div>
            <div className="field"><label>خصم البصمة المفقودة</label><div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" min="0" step="0.25" value={batch.missing_punch_deduction_days} onChange={(e)=>setBatchField('missing_punch_deduction_days',e.target.value)}/><span className="hint" style={{whiteSpace:'nowrap'}}>من قيمة اليوم / حالة مرفوضة</span></div></div>
            <div className="field"><label>طريقة الدفع الافتراضية</label><select value={batch.default_payment_method||''} onChange={(e)=>setBatchField('default_payment_method',e.target.value||null)}><option value="">تحدد لكل موظف</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}><button className="btn ghost" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ السياسة</button><button className="btn ghost" disabled={busy} onClick={()=>letterheadRef.current?.click()}>{batch.client_letterhead_path?'استبدال مطبوعات العميل':'رفع مطبوعات العميل'}</button><input ref={letterheadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e)=>uploadLetterhead(e.target.files?.[0])}/></div>
        </div>
      </div>

      <div className="section">
        <header><h2>3 — احتساب الأثر المالي</h2><span className="hint">هنا فقط تبدأ معالجة الرواتب فعليًا بعد اكتمال بياناتها.</span></header>
        <div style={{padding:18}}>
          <div className="rowsplit" style={{alignItems:'center'}}><div><strong>{salaryMissingCount===0?'البيانات جاهزة للاحتساب':`أكمل بيانات ${salaryMissingCount} موظف أولًا`}</strong><div className="hint" style={{marginTop:4}}>الغياب والبصمات المرفوضة وصافي فرق الساعات تؤخذ من نتيجة الحضور المعتمدة.</div></div><button className="btn" disabled={busy||salaryMissingCount>0} onClick={calculateAll}>{busy?'جارٍ الاحتساب…':'احتساب الأثر المالي'}</button></div>
        </div>
      </div>

      {lines.some((line)=>line.calculated_at)&&<div className="section">
        <header><h2>نتيجة المسير وقسائم الرواتب</h2><span className="hint">يمكن فتح تفاصيل الحضور لكل موظف ثم إصدار قسيمته.</span></header>
        <div className="stat-grid" style={{padding:18}}><div className="stat"><span>صافي الرواتب المرجعي</span><strong>{formatMoney(totals.reference)} ر.س</strong></div><div className="stat"><span>إجمالي الإضافات</span><strong>{formatMoney(totals.additions)} ر.س</strong></div><div className="stat"><span>إجمالي الخصومات</span><strong>{formatMoney(totals.deductions)} ر.س</strong></div><div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div></div>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>غياب</th><th>بصمات مفقودة</th><th>صافي الساعات</th><th>الإضافات</th><th>الخصومات</th><th>صافي المستحق</th><th>قسيمة</th></tr></thead><tbody>{people.map((person)=>{
          const line=lineByKey.get(person.key);const profile=profileByKey.get(person.key);if(!line||!profile||!line.calculated_at)return null;
          const calc=calculateExternalPayroll({days:daysByKey.get(person.key)||[],line,batch,profile,periodFrom:activeImport?.period_from,periodTo:activeImport?.period_to});
          const open=expanded===person.key;
          return <tr key={person.key} style={{verticalAlign:'top'}}><td><strong>{profile.display_name}</strong><div className="hint">{profile.display_employee_no||person.no||'—'}</div></td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.absenceDays} يوم`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:190}}>{calc.absenceDates.length?calc.absenceDates.join('، '):'لا يوجد غياب محتسب'}</div>}</td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.missingPunchDays} حالة`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:210}}>دخول {calc.missingInCount} · خروج {calc.missingOutCount}{calc.missingPunchDates.length?<><br/>{calc.missingPunchDates.map((x)=>`${x.date} ${x.kind==='missing_in'?'(دخول)':'(خروج)'}`).join('، ')}</>:null}</div>}</td><td>{calc.ready?<strong>{formatMinutesSigned(calc.netMinutes)}</strong>:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalAdditions)} ر.س`:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalDeductions)} ر.س`:'—'}</td><td><strong>{calc.ready?`${formatMoney(calc.finalNetSalary)} ر.س`:'—'}</strong></td><td><Link className="btn" href={`/dashboard/attendance/payroll/${batch.id}/payslip/${line.id}`} target="_blank">فتح القسيمة</Link></td></tr>;
        })}</tbody></table></div>
      </div>}
    </>}

    {profileDraft&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.4)',display:'grid',placeItems:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy){setProfileDraft(null);setEditKey('');}}}><div className="section" style={{width:'min(760px,96vw)',maxHeight:'90vh',overflow:'auto',background:'#fff',margin:0}}><header><h2>بيانات إضافية — {profileDraft.display_name}</h2><button className="btn ghost" onClick={()=>{setProfileDraft(null);setEditKey('');}}>إغلاق</button></header><div style={{padding:18}}>
      <div className="form-grid"><div className="field"><label>الاسم المعتمد</label><input value={profileDraft.display_name||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_name:e.target.value}))}/><span className="hint">المصدر: {profileDraft.source_employee_name||'—'}</span></div><div className="field"><label>الرقم الوظيفي</label><input value={profileDraft.display_employee_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_employee_no:e.target.value}))}/></div><div className="field"><label>المسمى الوظيفي</label><input value={profileDraft.job_title||''} onChange={(e)=>setProfileDraft((p)=>({...p,job_title:e.target.value}))}/></div><div className="field"><label>الهوية / الإقامة</label><input value={profileDraft.identity_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,identity_no:e.target.value}))}/></div><div className="field"><label>إضافة أخرى</label><input type="number" min="0" step="0.01" value={profileDraft.manual_additions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions:e.target.value}))}/><input placeholder="سبب الإضافة" style={{marginTop:7}} value={profileDraft.manual_additions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions_reason:e.target.value}))}/></div><div className="field"><label>خصم آخر</label><input type="number" min="0" step="0.01" value={profileDraft.manual_deductions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions:e.target.value}))}/><input placeholder="سبب الخصم" style={{marginTop:7}} value={profileDraft.manual_deductions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions_reason:e.target.value}))}/></div><div className="field"><label>طريقة الدفع الافتراضية للموظف</label><select value={profileDraft.default_payment_method||''} onChange={(e)=>setProfileDraft((p)=>({...p,default_payment_method:e.target.value||null}))}><option value="">بدون افتراضي</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div>
      <div style={{display:'flex',gap:16,marginTop:14,flexWrap:'wrap'}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_job_title} onChange={(e)=>setProfileDraft((p)=>({...p,show_job_title:e.target.checked}))}/> إظهار المسمى في القسيمة</label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_identity} onChange={(e)=>setProfileDraft((p)=>({...p,show_identity:e.target.checked}))}/> إظهار الهوية / الإقامة في القسيمة</label></div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="btn ghost" disabled={busy} onClick={()=>{setProfileDraft(null);setEditKey('');}}>إلغاء</button><button className="btn" disabled={busy} onClick={saveProfile}>{busy?'جارٍ الحفظ…':'حفظ'}</button></div>
    </div></div></div>}
  </div>;
}
