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
  sourceEmployeeKey,
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
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

export default function ExternalPayrollPage(){
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

  async function loadImports(){
    const q=await supabase.from('hr_attendance_imports')
      .select('id,period_from,period_to,status,processing_scope,client_entity_id,client_name_snapshot,client_reference,uploaded_at')
      .eq('processing_scope','external')
      .in('status',READY_IMPORT_STATUSES)
      .order('uploaded_at',{ascending:false})
      .limit(30);
    if(q.error){setErr(q.error.message);return;}
    const list=q.data||[]; setImports(list);
    if(!activeId && list[0]) setActiveId(list[0].id);
  }

  async function ensureWorkspace(item,sourceDays){
    if(!item) return;
    const clientKey=clientKeyOf(item);
    let currentBatch=null;
    const existing=await supabase.from('hr_external_payroll_batches').select('*').eq('attendance_import_id',item.id).maybeSingle();
    if(existing.error){throw existing.error;}
    currentBatch=existing.data;
    if(!currentBatch){
      const previous=await supabase.from('hr_external_payroll_batches').select('*').eq('client_key',clientKey).order('created_at',{ascending:false}).limit(1).maybeSingle();
      const settings=await supabase.from('hr_attendance_settings').select('missing_punch_deduction_days').eq('id',1).maybeSingle();
      const seed={
        attendance_import_id:item.id,
        client_key:clientKey,
        divisor_policy:previous.data?.divisor_policy || 'thirty',
        positive_time_policy:previous.data?.positive_time_policy || 'pay_net',
        missing_punch_deduction_days:previous.data?.missing_punch_deduction_days ?? settings.data?.missing_punch_deduction_days ?? 0.25,
        default_payment_method:previous.data?.default_payment_method || null,
        client_letterhead_path:previous.data?.client_letterhead_path || null,
      };
      const created=await supabase.from('hr_external_payroll_batches').insert(seed).select('*').single();
      if(created.error) throw created.error;
      currentBatch=created.data;
    }

    const persons=uniquePeople(sourceDays);
    const keys=persons.map((p)=>p.key);
    let currentProfiles=[];
    if(keys.length){
      const pq=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',clientKey).in('source_employee_key',keys);
      if(pq.error) throw pq.error;
      currentProfiles=pq.data||[];
      const existingKeys=new Set(currentProfiles.map((p)=>p.source_employee_key));
      const missing=persons.filter((p)=>!existingKeys.has(p.key)).map((p)=>({
        client_key:clientKey,
        source_employee_key:p.key,
        source_employee_no:p.no || null,
        source_employee_name:p.name || null,
        display_employee_no:p.no || null,
        display_name:p.name || 'غير معروف',
      }));
      if(missing.length){
        const iq=await supabase.from('hr_client_external_employee_profiles').insert(missing).select('*');
        if(iq.error) throw iq.error;
        currentProfiles=[...currentProfiles,...(iq.data||[])];
      }
    }

    let currentLines=[];
    const lq=await supabase.from('hr_external_payroll_lines').select('*').eq('payroll_batch_id',currentBatch.id);
    if(lq.error) throw lq.error;
    currentLines=lq.data||[];
    const existingLineKeys=new Set(currentLines.map((l)=>l.source_employee_key));
    const profileMap=new Map(currentProfiles.map((p)=>[p.source_employee_key,p]));
    const missingLines=persons.filter((p)=>!existingLineKeys.has(p.key)).map((p)=>({
      payroll_batch_id:currentBatch.id,
      external_person_id:p.externalPersonId,
      source_employee_key:p.key,
      payment_method:profileMap.get(p.key)?.default_payment_method || currentBatch.default_payment_method || null,
    }));
    if(missingLines.length){
      const iq=await supabase.from('hr_external_payroll_lines').insert(missingLines).select('*');
      if(iq.error) throw iq.error;
      currentLines=[...currentLines,...(iq.data||[])];
    }

    setBatch(currentBatch);
    setProfiles(currentProfiles);
    setLines(currentLines);
  }

  async function loadActive(id){
    const item=imports.find((x)=>x.id===id);
    if(!item) return;
    setBusy(true); setErr(''); setMsg(''); setBatch(null); setLines([]); setProfiles([]); setDirty(false);
    try{
      const q=await supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',id).order('subject_name').order('work_date');
      if(q.error) throw q.error;
      const source=q.data||[]; setDays(source);
      await ensureWorkspace(item,source);
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  useEffect(()=>{loadImports();},[]);
  useEffect(()=>{if(activeId && imports.length) loadActive(activeId);},[activeId,imports.length]);

  function setBatchField(field,value){setBatch((b)=>({...b,[field]:value}));setDirty(true);}
  function setLineField(id,field,value){setLines((list)=>list.map((line)=>line.id===id?{...line,[field]:value}:line));setDirty(true);}

  async function saveInputs(showMessage=true){
    if(!batch) return false;
    setBusy(true); setErr(''); if(showMessage)setMsg('');
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
      if(bq.error) throw bq.error;
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
        if(q.error) throw q.error;
      }
      setDirty(false);
      if(showMessage)setMsg('تم حفظ بيانات الرواتب.');
      setBusy(false); return true;
    }catch(e){setErr(e.message||String(e));setBusy(false);return false;}
  }

  function openProfile(key){
    const p=profileByKey.get(key); const line=lineByKey.get(key);
    if(!p||!line)return;
    setEditKey(key);
    setProfileDraft({...p,
      show_job_title:!!line.show_job_title,
      show_identity:!!line.show_identity,
      day_hours_override:line.day_hours_override??'',
      basic_salary:line.basic_salary??'',
      housing_allowance:line.housing_allowance??'',
      transport_allowance:line.transport_allowance??'',
      other_allowances:line.other_allowances??'',
      manual_additions:line.manual_additions??0,
      manual_additions_reason:line.manual_additions_reason||'',
      manual_deductions:line.manual_deductions??0,
      manual_deductions_reason:line.manual_deductions_reason||'',
    });
  }

  async function saveProfile(){
    const draft=profileDraft; const line=lineByKey.get(editKey);
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
      if(pq.error) throw pq.error;
      const lpatch={
        show_job_title:!!draft.show_job_title,
        show_identity:!!draft.show_identity,
        day_hours_override:numberOrNull(draft.day_hours_override),
        basic_salary:numberOrNull(draft.basic_salary),
        housing_allowance:numberOrNull(draft.housing_allowance),
        transport_allowance:numberOrNull(draft.transport_allowance),
        other_allowances:numberOrNull(draft.other_allowances),
        manual_additions:Number(draft.manual_additions||0),
        manual_additions_reason:String(draft.manual_additions_reason||'').trim()||null,
        manual_deductions:Number(draft.manual_deductions||0),
        manual_deductions_reason:String(draft.manual_deductions_reason||'').trim()||null,
        updated_at:new Date().toISOString(),
      };
      const lq=await supabase.from('hr_external_payroll_lines').update(lpatch).eq('id',line.id).select('*').single();
      if(lq.error) throw lq.error;
      setProfiles((list)=>list.map((p)=>p.id===draft.id?pq.data:p));
      setLines((list)=>list.map((l)=>l.id===line.id?lq.data:l));
      setEditKey('');setProfileDraft(null);setDirty(false);setMsg('تم تحديث بيانات الموظف المعتمدة.');
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  async function calculateAll(){
    if(!batch||!activeImport)return;
    const saved=dirty?await saveInputs(false):true; if(!saved)return;
    setBusy(true);setErr('');setMsg('');
    let completed=0; const incomplete=[];
    const refreshedLines=[];
    try{
      for(const line of lines){
        const profile=profileByKey.get(line.source_employee_key)||{};
        const calc=calculateExternalPayroll({
          days:daysByKey.get(line.source_employee_key)||[],line,batch,profile,
          periodFrom:activeImport.period_from,periodTo:activeImport.period_to,
        });
        if(!calc.ready){incomplete.push(`${profile.display_name||profile.source_employee_name||line.source_employee_key}: ${calc.reason}`);refreshedLines.push(line);continue;}
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
        if(q.error) throw q.error;
        refreshedLines.push(q.data);completed+=1;
      }
      const status=incomplete.length?'draft':'calculated';
      const bq=await supabase.from('hr_external_payroll_batches').update({status,updated_at:new Date().toISOString()}).eq('id',batch.id).select('*').single();
      if(bq.error) throw bq.error;
      setBatch(bq.data);setLines(refreshedLines);
      if(incomplete.length)setErr(`تم احتساب ${completed} موظف. يتبقى ${incomplete.length}: ${incomplete.slice(0,4).join(' | ')}`);
      else setMsg(`اكتمل احتساب ${completed} موظف. قسائم الرواتب جاهزة للإصدار.`);
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  async function exportSalaryTemplate(){
    if(!activeImport)return;
    setBusy(true);setErr('');
    try{
      const {default:ExcelJS}=await import('exceljs');
      const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('بيانات الرواتب',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:16},{header:'اسم الموظف',key:'name',width:30},{header:'صافي الراتب المرجعي',key:'net',width:20},
        {header:'الراتب الأساسي',key:'basic',width:18},{header:'بدل السكن',key:'housing',width:16},{header:'بدل النقل',key:'transport',width:16},{header:'بدلات أخرى',key:'other',width:16},
        {header:'المسمى الوظيفي',key:'job',width:24},{header:'الهوية / الإقامة',key:'identity',width:20},{header:'طريقة الدفع',key:'payment',width:22},{header:'__source_key',key:'source',hidden:true,width:10},
      ];
      people.forEach((person)=>{
        const p=profileByKey.get(person.key)||{}; const l=lineByKey.get(person.key)||{};
        ws.addRow({no:p.display_employee_no||person.no,name:p.display_name||person.name,net:l.reference_net_salary??'',basic:l.basic_salary??'',housing:l.housing_allowance??'',transport:l.transport_allowance??'',other:l.other_allowances??'',job:p.job_title||'',identity:p.identity_no||'',payment:PAYMENT_METHOD_LABEL[l.payment_method||p.default_payment_method||batch?.default_payment_method]||'',source:person.key});
      });
      ws.getRow(1).eachCell((cell)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:10}};
      for(let r=2;r<=ws.lastRow.number;r++){ws.getRow(r).getCell(10).dataValidation={type:'list',allowBlank:true,formulae:['"حماية الأجور – مدد,تحويل بنكي,نقدًا"']};}
      const info=wb.addWorksheet('إرشادات'); info.views=[{rightToLeft:true}]; info.getColumn(1).width=105;
      info.getCell('A1').value='بيانات الرواتب — العميل الخارجي';info.getCell('A1').font={bold:true,size:16};
      info.getCell('A3').value='أدخل صافي الراتب الذي يستحقه الموظف عند عدم وجود غياب أو خصم حضور. بقية مكونات الراتب اختيارية وتستخدم للعرض في قسيمة الراتب.';
      info.getCell('A4').value='لا تحذف العمود التقني المخفي؛ فهو يضمن ربط البيانات بالموظف الصحيح حتى لو عدّلت الاسم المعروض.';
      const buffer=await wb.xlsx.writeBuffer();downloadBuffer(buffer,`بيانات_رواتب_${activeImport.client_name_snapshot||'العميل'}_${dateOnly(activeImport.period_from)}.xlsx`);
    }catch(e){setErr(e.message||String(e));}
    setBusy(false);
  }

  async function importSalaryFile(file){
    if(!file||!batch)return;
    setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs'); const wb=new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws=wb.getWorksheet('بيانات الرواتب')||wb.worksheets[0]; if(!ws) throw new Error('ملف الرواتب لا يحتوي ورقة بيانات.');
      const expected=['رقم الموظف','اسم الموظف','صافي الراتب المرجعي','الراتب الأساسي','بدل السكن','بدل النقل','بدلات أخرى','المسمى الوظيفي','الهوية / الإقامة','طريقة الدفع','__source_key'];
      expected.forEach((label,i)=>{if(cellText(ws.getRow(1).getCell(i+1))!==label)throw new Error('بنية ملف الرواتب تغيرت. استخدم النموذج الصادر من البرنامج.');});
      let changed=0;
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r); const key=cellText(row.getCell(11)); if(!key)continue;
        const line=lineByKey.get(key); const profile=profileByKey.get(key); if(!line||!profile)continue;
        const payment=paymentValue(cellText(row.getCell(10)));
        const pq=await supabase.from('hr_client_external_employee_profiles').update({
          display_employee_no:cellText(row.getCell(1))||profile.display_employee_no||null,
          display_name:cellText(row.getCell(2))||profile.display_name,
          job_title:cellText(row.getCell(8))||null,
          identity_no:cellText(row.getCell(9))||null,
          default_payment_method:payment||profile.default_payment_method||null,
          updated_at:new Date().toISOString(),
        }).eq('id',profile.id);
        if(pq.error)throw pq.error;
        const lq=await supabase.from('hr_external_payroll_lines').update({
          reference_net_salary:numberOrNull(cellText(row.getCell(3))),basic_salary:numberOrNull(cellText(row.getCell(4))),housing_allowance:numberOrNull(cellText(row.getCell(5))),transport_allowance:numberOrNull(cellText(row.getCell(6))),other_allowances:numberOrNull(cellText(row.getCell(7))),payment_method:payment||line.payment_method||null,updated_at:new Date().toISOString(),
        }).eq('id',line.id);
        if(lq.error)throw lq.error; changed++;
      }
      await loadActive(activeId);setMsg(`تم تحديث بيانات ${changed} موظف من ملف الرواتب.`);
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
      if(q.error)throw q.error; setBatch(q.data);setMsg('تم اعتماد مطبوعات العميل لهذه الدفعة دون ضغط الصورة أو خفض جودتها.');
    }catch(e){setErr(e.message||String(e));}
    setBusy(false); if(letterheadRef.current)letterheadRef.current.value='';
  }

  const totals=useMemo(()=>lines.reduce((acc,line)=>{
    acc.reference+=Number(line.reference_net_salary||0);acc.additions+=Number(line.calculated_total_additions||0);acc.deductions+=Number(line.calculated_total_deductions||0);acc.final+=Number(line.calculated_final_net_salary||0);return acc;
  },{reference:0,additions:0,deductions:0,final:0}),[lines]);

  return <div>
    <div className="page-head"><div><h1>معالجة الرواتب</h1><p>تحويل نتيجة الحضور المعتمدة إلى أثر مالي وقسائم راتب فردية.</p></div><Link className="btn ghost" href="/dashboard/attendance/external-review">مراجعة التبريرات</Link></div>
    {err&&<div className="msg err" style={{marginTop:14}}>{err}</div>}{msg&&<div className="msg ok" style={{marginTop:14}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}><header><h2>دفعة الرواتب</h2><span className="hint">تظهر الدفعات التي اكتملت مراجعتها وإعادة احتسابها.</span></header><div style={{padding:18}}>
      <div className="form-grid"><div className="field" style={{gridColumn:'1/-1'}}><label>العميل والفترة</label><select value={activeId} onChange={(e)=>setActiveId(e.target.value)} disabled={busy}>{!imports.length&&<option value="">لا توجد دفعات جاهزة</option>}{imports.map((item)=><option key={item.id} value={item.id}>{item.client_name_snapshot||'عميل خارجي'} — {dateOnly(item.period_from)} إلى {dateOnly(item.period_to)}</option>)}</select></div></div>
      {activeImport&&<div className="stat-grid" style={{marginTop:14}}><div className="stat"><span>شهر الرواتب</span><strong>{payrollMonthLabel(activeImport.period_from)}</strong></div><div className="stat"><span>الموظفون</span><strong>{people.length}</strong></div><div className="stat"><span>حالة المسير</span><strong>{batch?.status==='calculated'?'محسوب':batch?.status==='final'?'معتمد':'مسودة'}</strong></div><div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div></div>}
    </div></div>

    {batch&&<>
      <div className="section"><header><h2>سياسة الاحتساب</h2><span className="hint">تطبق على الدفعة كاملة، مع إمكانية تحديد ساعات يوم مختلفة لموظف بعينه.</span></header><div style={{padding:18}}>
        <div className="form-grid">
          <div className="field"><label>قسمة صافي الراتب</label><select value={batch.divisor_policy} onChange={(e)=>setBatchField('divisor_policy',e.target.value)}><option value="thirty">30 يومًا</option><option value="calendar_days">أيام الشهر التقويمية</option></select></div>
          <div className="field"><label>معالجة صافي الساعات الزائدة</label><select value={batch.positive_time_policy} onChange={(e)=>setBatchField('positive_time_policy',e.target.value)}><option value="pay_net">تضاف قيمتها للمستحق</option><option value="offset_only">تعوض النقص فقط ولا تصرف زيادة</option></select></div>
          <div className="field"><label>خصم البصمة المفقودة</label><div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" min="0" step="0.25" value={batch.missing_punch_deduction_days} onChange={(e)=>setBatchField('missing_punch_deduction_days',e.target.value)}/><span className="hint" style={{whiteSpace:'nowrap'}}>من قيمة اليوم / حالة مرفوضة</span></div></div>
          <div className="field"><label>طريقة الدفع الافتراضية</label><select value={batch.default_payment_method||''} onChange={(e)=>setBatchField('default_payment_method',e.target.value||null)}><option value="">تحدد لكل موظف</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div className="rowsplit" style={{marginTop:14,justifyContent:'flex-start',gap:10,flexWrap:'wrap'}}><button className="btn" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ إعدادات الرواتب</button><button className="btn ghost" disabled={busy} onClick={exportSalaryTemplate}>تنزيل نموذج بيانات الرواتب</button><button className="btn ghost" disabled={busy} onClick={()=>salaryFileRef.current?.click()}>رفع بيانات الرواتب</button><input ref={salaryFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importSalaryFile(e.target.files?.[0])}/><button className="btn ghost" disabled={busy} onClick={()=>letterheadRef.current?.click()}>{batch.client_letterhead_path?'استبدال مطبوعات العميل':'رفع مطبوعات العميل'}</button><input ref={letterheadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e)=>uploadLetterhead(e.target.files?.[0])}/></div>
      </div></div>

      <div className="section"><header><h2>الموظفون</h2><span className="hint">الاسم المعتمد قابل للتعديل دون تغيير بيانات جهاز البصمة الأصلية.</span></header><div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>صافي الراتب المرجعي</th><th>غياب</th><th>بصمات مفقودة</th><th>صافي الساعات</th><th>الإضافات</th><th>الخصومات</th><th>المستحق</th><th>طريقة الدفع</th><th>إجراء</th></tr></thead><tbody>
        {people.map((person)=>{
          const line=lineByKey.get(person.key); const profile=profileByKey.get(person.key); if(!line||!profile)return null;
          const calc=calculateExternalPayroll({days:daysByKey.get(person.key)||[],line,batch,profile,periodFrom:activeImport?.period_from,periodTo:activeImport?.period_to});
          const inferred=inferDayHours(daysByKey.get(person.key)||[]);
          const isExpanded=expanded===person.key;
          return <tr key={person.key} style={{verticalAlign:'top'}}>
            <td><strong>{profile.display_name}</strong><div className="hint">{profile.display_employee_no||person.no||'—'}{profile.display_name!==profile.source_employee_name&&profile.source_employee_name?` · المصدر: ${profile.source_employee_name}`:''}</div></td>
            <td><input type="number" min="0" step="0.01" value={line.reference_net_salary??''} onChange={(e)=>setLineField(line.id,'reference_net_salary',e.target.value)} style={{minWidth:130}}/></td>
            <td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(isExpanded?'':person.key)}>{calc.ready?`${calc.absenceDays} يوم`:'—'}</button>{isExpanded&&calc.ready&&<div className="hint" style={{marginTop:6,maxWidth:190}}>{calc.absenceDates.length?calc.absenceDates.join('، '):'لا يوجد غياب محتسب'}</div>}</td>
            <td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(isExpanded?'':person.key)}>{calc.ready?`${calc.missingPunchDays} يوم`:'—'}</button>{isExpanded&&calc.ready&&<div className="hint" style={{marginTop:6,maxWidth:220}}>دخول: {calc.missingInCount} · خروج: {calc.missingOutCount}{calc.missingPunchDates.length?<><br/>{calc.missingPunchDates.map((x)=>`${x.date} ${x.kind==='missing_in'?'(دخول)':'(خروج)'}`).join('، ')}</>:null}</div>}</td>
            <td>{calc.ready?<><strong>{formatMinutesSigned(calc.netMinutes)}</strong><div className="hint">+{formatMinutesSigned(calc.extraMinutes).replace('+','')} / −{formatMinutesSigned(-calc.shortMinutes).replace('−','')}</div></>:<span className="hint">{calc.reason}</span>}</td>
            <td>{calc.ready?`${formatMoney(calc.totalAdditions)} ر.س`:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalDeductions)} ر.س`:'—'}</td><td><strong>{calc.ready?`${formatMoney(calc.finalNetSalary)} ر.س`:'—'}</strong></td>
            <td><select value={line.payment_method||''} onChange={(e)=>setLineField(line.id,'payment_method',e.target.value||null)} style={{minWidth:150}}><option value="">{batch.default_payment_method?`افتراضي: ${PAYMENT_METHOD_LABEL[batch.default_payment_method]}`:'اختر'}</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
            <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn ghost" onClick={()=>openProfile(person.key)}>بيانات الموظف</button>{line.calculated_at&&<Link className="btn" href={`/dashboard/attendance/payroll/${batch.id}/payslip/${line.id}`} target="_blank">قسيمة PDF</Link>}</div><div className="hint" style={{marginTop:5}}>ساعات اليوم: {line.day_hours_override||inferred||'غير محددة'}</div></td>
          </tr>;
        })}
        {!people.length&&<tr><td colSpan={10}><div className="hint" style={{padding:20}}>لا توجد بيانات حضور في هذه الدفعة.</div></td></tr>}
      </tbody></table></div>
      <div style={{padding:16,borderTop:'1px solid rgba(148,163,184,.2)'}} className="rowsplit"><div className="hint">الساعات الزائدة والنقص تجمع شهريًا أولًا؛ أيام الغياب والبصمات المفقودة ذات الخصم المستقل لا تخصم مرة ثانية كساعات.</div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="btn ghost" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ</button><button className="btn" disabled={busy} onClick={calculateAll}>{busy?'جارٍ الاحتساب…':'احتساب الأثر المالي'}</button></div></div>
      </div>

      {lines.some((l)=>l.calculated_at)&&<div className="section"><header><h2>خلاصة المسير</h2><span className="hint">القيم المحسوبة آخر مرة.</span></header><div className="stat-grid" style={{padding:18}}><div className="stat"><span>صافي الرواتب المرجعي</span><strong>{formatMoney(totals.reference)} ر.س</strong></div><div className="stat"><span>إجمالي الإضافات</span><strong>{formatMoney(totals.additions)} ر.س</strong></div><div className="stat"><span>إجمالي الخصومات</span><strong>{formatMoney(totals.deductions)} ر.س</strong></div><div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div></div></div>}
    </>}

    {profileDraft&&<div className="modal-backdrop" style={{position:'fixed',inset:0,zIndex:90,background:'rgba(15,23,42,.42)',display:'grid',placeItems:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy){setEditKey('');setProfileDraft(null);}}}><div className="section" style={{width:'min(860px,96vw)',maxHeight:'90vh',overflow:'auto',background:'#fff',margin:0}}><header><h2>بيانات الموظف</h2><button className="btn ghost" disabled={busy} onClick={()=>{setEditKey('');setProfileDraft(null);}}>إغلاق</button></header><div style={{padding:18}}>
      <div className="form-grid"><div className="field"><label>الاسم المعتمد</label><input value={profileDraft.display_name||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_name:e.target.value}))}/><span className="hint">المصدر: {profileDraft.source_employee_name||'—'}</span></div><div className="field"><label>الرقم الوظيفي</label><input value={profileDraft.display_employee_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_employee_no:e.target.value}))}/></div><div className="field"><label>المسمى الوظيفي</label><input value={profileDraft.job_title||''} onChange={(e)=>setProfileDraft((p)=>({...p,job_title:e.target.value}))}/></div><div className="field"><label>الهوية / الإقامة</label><input value={profileDraft.identity_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,identity_no:e.target.value}))}/></div><div className="field"><label>ساعات اليوم</label><input type="number" min="0.5" step="0.25" value={profileDraft.day_hours_override??''} onChange={(e)=>setProfileDraft((p)=>({...p,day_hours_override:e.target.value}))}/><span className="hint">اتركها فارغة لاستخدام الساعات المستنتجة من جدول الدوام.</span></div><div className="field"><label>طريقة الدفع الافتراضية للموظف</label><select value={profileDraft.default_payment_method||''} onChange={(e)=>setProfileDraft((p)=>({...p,default_payment_method:e.target.value||null}))}><option value="">بدون افتراضي</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label>الراتب الأساسي</label><input type="number" min="0" step="0.01" value={profileDraft.basic_salary??''} onChange={(e)=>setProfileDraft((p)=>({...p,basic_salary:e.target.value}))}/></div><div className="field"><label>بدل السكن</label><input type="number" min="0" step="0.01" value={profileDraft.housing_allowance??''} onChange={(e)=>setProfileDraft((p)=>({...p,housing_allowance:e.target.value}))}/></div><div className="field"><label>بدل النقل</label><input type="number" min="0" step="0.01" value={profileDraft.transport_allowance??''} onChange={(e)=>setProfileDraft((p)=>({...p,transport_allowance:e.target.value}))}/></div><div className="field"><label>بدلات أخرى</label><input type="number" min="0" step="0.01" value={profileDraft.other_allowances??''} onChange={(e)=>setProfileDraft((p)=>({...p,other_allowances:e.target.value}))}/></div>
      <div className="field"><label>إضافة أخرى</label><input type="number" min="0" step="0.01" value={profileDraft.manual_additions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions:e.target.value}))}/><input placeholder="سبب الإضافة" value={profileDraft.manual_additions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions_reason:e.target.value}))} style={{marginTop:7}}/></div><div className="field"><label>خصم آخر</label><input type="number" min="0" step="0.01" value={profileDraft.manual_deductions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions:e.target.value}))}/><input placeholder="سبب الخصم" value={profileDraft.manual_deductions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions_reason:e.target.value}))} style={{marginTop:7}}/></div></div>
      <div style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap'}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_job_title} onChange={(e)=>setProfileDraft((p)=>({...p,show_job_title:e.target.checked}))}/> إظهار المسمى الوظيفي في القسيمة</label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_identity} onChange={(e)=>setProfileDraft((p)=>({...p,show_identity:e.target.checked}))}/> إظهار الهوية / الإقامة في القسيمة</label></div>
      <div className="rowsplit" style={{marginTop:18,justifyContent:'flex-end',gap:10}}><button className="btn ghost" disabled={busy} onClick={()=>{setEditKey('');setProfileDraft(null);}}>إلغاء</button><button className="btn" disabled={busy} onClick={saveProfile}>{busy?'جارٍ الحفظ…':'حفظ بيانات الموظف'}</button></div>
    </div></div></div>}
  </div>;
}
