'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { externalStageHref, getCurrentExternalImportId, setCurrentExternalImportId } from '@/lib/attendance/current-external-import';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  SOCIAL_INSURANCE_SCHEMES,
  SOCIAL_INSURANCE_SCHEME_LABEL,
  calculateExternalPayroll,
  salaryBreakdown,
  formatMoney,
  formatMinutesSigned,
  groupDaysByEmployee,
  inferDayHours,
  payrollMonthLabel,
  uniquePeople,
} from '@/lib/attendance/external-payroll';

const READY_IMPORT_STATUSES=['recalculated','ready_to_post'];

function dateOnly(value){return value?String(value).slice(0,10):'';}
function clientKeyOf(item){
  if(item?.client_entity_id)return `entity:${item.client_entity_id}`;
  return `name:${String(item?.client_name_snapshot||'external-client').trim().toLowerCase().replace(/\s+/g,' ')}`;
}
function numberOrNull(value){
  if(value===''||value==null)return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function cellText(cell){
  const value=cell?.value;if(value==null)return '';
  if(typeof value==='object'&&value.text!=null)return String(value.text).trim();
  if(typeof value==='object'&&value.result!=null)return String(value.result).trim();
  return String(value).trim();
}
function paymentValue(value){const text=String(value||'').trim();return PAYMENT_METHODS.find(([key,label])=>text===key||text===label)?.[0]||null;}
function insuranceValue(value){const text=String(value||'').trim();return SOCIAL_INSURANCE_SCHEMES.find(([key,label])=>text===key||text===label)?.[0]||null;}
function safePart(value){return encodeURIComponent(String(value||'client')).replace(/%/g,'_');}
function batchLabel(item){return `${item.client_name_snapshot||'عميل خارجي'} — ${dateOnly(item.period_from)} إلى ${dateOnly(item.period_to)}`;}
function downloadBuffer(buffer,filename){
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}

export default function ExternalPayrollWorkspace(){
  const searchParams=useSearchParams();
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
  const drafts=useMemo(()=>imports.filter((item)=>item.id!==activeId),[imports,activeId]);
  const people=useMemo(()=>uniquePeople(days),[days]);
  const daysByKey=useMemo(()=>groupDaysByEmployee(days),[days]);
  const profileByKey=useMemo(()=>new Map(profiles.map((p)=>[p.source_employee_key,p])),[profiles]);
  const lineByKey=useMemo(()=>new Map(lines.map((l)=>[l.source_employee_key,l])),[lines]);

  const salaryState=useMemo(()=>people.map((person)=>{
    const line=lineByKey.get(person.key)||{};const profile=profileByKey.get(person.key)||{};
    return {key:person.key,...salaryBreakdown({line,profile,periodFrom:activeImport?.period_from})};
  }),[people,lineByKey,profileByKey,activeImport?.period_from]);
  const salaryStateByKey=useMemo(()=>new Map(salaryState.map((x)=>[x.key,x])),[salaryState]);
  const salaryReadyCount=salaryState.filter((x)=>x.ready).length;
  const salaryMissingCount=Math.max(0,people.length-salaryReadyCount);

  async function loadImports(){
    const q=await supabase.from('hr_attendance_imports').select('id,period_from,period_to,status,processing_scope,client_entity_id,client_name_snapshot,client_reference,uploaded_at')
      .eq('processing_scope','external').in('status',READY_IMPORT_STATUSES).order('uploaded_at',{ascending:false}).limit(30);
    if(q.error){setErr(q.error.message);return;}
    const list=q.data||[];setImports(list);
    const urlId=searchParams.get('batch')||'';const remembered=getCurrentExternalImportId();
    setActiveId((current)=>{
      for(const id of [urlId,current,remembered]){if(id&&list.some((x)=>x.id===id))return id;}
      return list[0]?.id||'';
    });
  }

  async function ensureWorkspace(item,sourceDays){
    if(!item)return;
    const clientKey=clientKeyOf(item);
    const existing=await supabase.from('hr_external_payroll_batches').select('*').eq('attendance_import_id',item.id).maybeSingle();
    if(existing.error)throw existing.error;
    let currentBatch=existing.data;
    if(!currentBatch){
      const previous=await supabase.from('hr_external_payroll_batches').select('*').eq('client_key',clientKey).order('created_at',{ascending:false}).limit(1).maybeSingle();
      const settings=await supabase.from('hr_attendance_settings').select('missing_punch_deduction_days').eq('id',1).maybeSingle();
      const created=await supabase.from('hr_external_payroll_batches').insert({attendance_import_id:item.id,client_key:clientKey,divisor_policy:previous.data?.divisor_policy||'thirty',positive_time_policy:previous.data?.positive_time_policy||'pay_net',missing_punch_deduction_days:previous.data?.missing_punch_deduction_days??settings.data?.missing_punch_deduction_days??0.25,default_payment_method:previous.data?.default_payment_method||null,client_letterhead_path:previous.data?.client_letterhead_path||null}).select('*').single();
      if(created.error)throw created.error;currentBatch=created.data;
    }

    const persons=uniquePeople(sourceDays);const keys=persons.map((p)=>p.key);let currentProfiles=[];
    if(keys.length){
      const pq=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',clientKey).in('source_employee_key',keys);if(pq.error)throw pq.error;currentProfiles=pq.data||[];
      const existingKeys=new Set(currentProfiles.map((p)=>p.source_employee_key));
      const missing=persons.filter((p)=>!existingKeys.has(p.key)).map((p)=>({client_key:clientKey,source_employee_key:p.key,source_employee_no:p.no||null,source_employee_name:p.name||null,display_employee_no:p.no||null,display_name:p.name||'غير معروف'}));
      if(missing.length){const iq=await supabase.from('hr_client_external_employee_profiles').insert(missing).select('*');if(iq.error)throw iq.error;currentProfiles=[...currentProfiles,...(iq.data||[])];}
    }

    const lq=await supabase.from('hr_external_payroll_lines').select('*').eq('payroll_batch_id',currentBatch.id);if(lq.error)throw lq.error;let currentLines=lq.data||[];
    const existingLineKeys=new Set(currentLines.map((line)=>line.source_employee_key));const profileMap=new Map(currentProfiles.map((p)=>[p.source_employee_key,p]));
    const missingLines=persons.filter((p)=>!existingLineKeys.has(p.key)).map((p)=>({payroll_batch_id:currentBatch.id,external_person_id:p.externalPersonId,source_employee_key:p.key,payment_method:profileMap.get(p.key)?.default_payment_method||currentBatch.default_payment_method||null}));
    if(missingLines.length){const iq=await supabase.from('hr_external_payroll_lines').insert(missingLines).select('*');if(iq.error)throw iq.error;currentLines=[...currentLines,...(iq.data||[])];}
    setBatch(currentBatch);setProfiles(currentProfiles);setLines(currentLines);
  }

  async function loadActive(id){
    const item=imports.find((x)=>x.id===id);if(!item)return;
    setBusy(true);setErr('');setMsg('');setBatch(null);setLines([]);setProfiles([]);setDirty(false);
    try{const q=await supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',id).order('subject_name').order('work_date');if(q.error)throw q.error;const source=q.data||[];setDays(source);await ensureWorkspace(item,source);}catch(e){setErr(e.message||String(e));}setBusy(false);
  }

  useEffect(()=>{loadImports();},[]);
  useEffect(()=>{if(activeId){setCurrentExternalImportId(activeId);if(imports.length)loadActive(activeId);}},[activeId,imports.length]);

  function chooseBatch(id){setActiveId(id);setCurrentExternalImportId(id);}
  function setBatchField(field,value){setBatch((current)=>({...current,[field]:value}));setDirty(true);}
  function setLineField(id,field,value){setLines((list)=>list.map((line)=>line.id===id?{...line,[field]:value}:line));setDirty(true);}
  function setProfileField(id,field,value){setProfiles((list)=>list.map((p)=>p.id===id?{...p,[field]:value}:p));setDirty(true);}

  async function saveInputs(showMessage=true){
    if(!batch)return false;setBusy(true);setErr('');if(showMessage)setMsg('');
    try{
      const bq=await supabase.from('hr_external_payroll_batches').update({divisor_policy:batch.divisor_policy,positive_time_policy:batch.positive_time_policy,missing_punch_deduction_days:Number(batch.missing_punch_deduction_days||0),default_payment_method:batch.default_payment_method||null,client_letterhead_path:batch.client_letterhead_path||null,status:batch.status==='final'?'final':'draft',updated_at:new Date().toISOString()}).eq('id',batch.id);if(bq.error)throw bq.error;
      for(const person of people){
        const profile=profileByKey.get(person.key);const line=lineByKey.get(person.key);if(!profile||!line)continue;
        const pq=await supabase.from('hr_client_external_employee_profiles').update({display_employee_no:profile.display_employee_no||null,display_name:profile.display_name||profile.source_employee_name||'غير معروف',job_title:profile.job_title||null,identity_no:profile.identity_no||null,default_payment_method:profile.default_payment_method||null,social_insurance_scheme:profile.social_insurance_scheme||null,updated_at:new Date().toISOString()}).eq('id',profile.id);if(pq.error)throw pq.error;
        const breakdown=salaryBreakdown({line,profile,periodFrom:activeImport?.period_from});
        const lq=await supabase.from('hr_external_payroll_lines').update({reference_net_salary:breakdown.ready?breakdown.referenceNetSalary:null,basic_salary:numberOrNull(line.basic_salary),housing_allowance:numberOrNull(line.housing_allowance),transport_allowance:numberOrNull(line.transport_allowance),other_allowances:numberOrNull(line.other_allowances),gosi_employee_rate_override:numberOrNull(line.gosi_employee_rate_override),manual_additions:Number(line.manual_additions||0),manual_additions_reason:line.manual_additions_reason||null,manual_deductions:Number(line.manual_deductions||0),manual_deductions_reason:line.manual_deductions_reason||null,payment_method:line.payment_method||null,day_hours_override:numberOrNull(line.day_hours_override),show_job_title:!!line.show_job_title,show_identity:!!line.show_identity,updated_at:new Date().toISOString()}).eq('id',line.id);if(lq.error)throw lq.error;
      }
      setDirty(false);if(showMessage)setMsg('تم الحفظ.');setBusy(false);return true;
    }catch(e){setErr(e.message||String(e));setBusy(false);return false;}
  }

  function openProfile(key){
    const profile=profileByKey.get(key);const line=lineByKey.get(key);if(!profile||!line)return;
    setEditKey(key);setProfileDraft({...profile,show_job_title:!!line.show_job_title,show_identity:!!line.show_identity,manual_additions:line.manual_additions??0,manual_additions_reason:line.manual_additions_reason||'',manual_deductions:line.manual_deductions??0,manual_deductions_reason:line.manual_deductions_reason||''});
  }

  async function saveProfile(){
    const draft=profileDraft;const line=lineByKey.get(editKey);if(!draft||!line)return;if(!String(draft.display_name||'').trim()){setErr('اسم الموظف مطلوب.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const pq=await supabase.from('hr_client_external_employee_profiles').update({display_employee_no:String(draft.display_employee_no||'').trim()||null,display_name:String(draft.display_name||'').trim(),job_title:String(draft.job_title||'').trim()||null,identity_no:String(draft.identity_no||'').trim()||null,default_payment_method:draft.default_payment_method||null,updated_at:new Date().toISOString()}).eq('id',draft.id).select('*').single();if(pq.error)throw pq.error;
      const lq=await supabase.from('hr_external_payroll_lines').update({show_job_title:!!draft.show_job_title,show_identity:!!draft.show_identity,manual_additions:Number(draft.manual_additions||0),manual_additions_reason:String(draft.manual_additions_reason||'').trim()||null,manual_deductions:Number(draft.manual_deductions||0),manual_deductions_reason:String(draft.manual_deductions_reason||'').trim()||null,updated_at:new Date().toISOString()}).eq('id',line.id).select('*').single();if(lq.error)throw lq.error;
      setProfiles((list)=>list.map((p)=>p.id===draft.id?pq.data:p));setLines((list)=>list.map((item)=>item.id===line.id?lq.data:item));setEditKey('');setProfileDraft(null);setDirty(false);setMsg('تم الحفظ.');
    }catch(e){setErr(e.message||String(e));}setBusy(false);
  }

  async function exportSalaryTemplate(){
    if(!activeImport)return;setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('بيانات الرواتب',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:16},{header:'اسم الموظف',key:'name',width:30},{header:'الراتب الأساسي',key:'basic',width:18},{header:'بدل السكن',key:'housing',width:16},{header:'بدل النقل',key:'transport',width:16},{header:'بدلات أخرى',key:'other',width:16},
        {header:'فئة التأمينات',key:'insurance',width:25},{header:'نسبة الموظف %',key:'rate',width:16},{header:'ساعات اليوم',key:'hours',width:14},{header:'طريقة الدفع',key:'payment',width:22},{header:'المسمى الوظيفي',key:'job',width:24},{header:'الهوية / الإقامة',key:'identity',width:20},
        {header:'إضافة',key:'addition',width:14},{header:'سبب الإضافة',key:'addition_reason',width:26},{header:'خصم',key:'deduction',width:14},{header:'سبب الخصم',key:'deduction_reason',width:26},{header:'__source_key',key:'source',hidden:true},
      ];
      people.forEach((person)=>{const profile=profileByKey.get(person.key)||{};const line=lineByKey.get(person.key)||{};ws.addRow({no:profile.display_employee_no||person.no,name:profile.display_name||person.name,basic:line.basic_salary??'',housing:line.housing_allowance??'',transport:line.transport_allowance??'',other:line.other_allowances??'',insurance:SOCIAL_INSURANCE_SCHEME_LABEL[profile.social_insurance_scheme]||'',rate:line.gosi_employee_rate_override??'',hours:line.day_hours_override??'',payment:PAYMENT_METHOD_LABEL[line.payment_method||profile.default_payment_method||batch?.default_payment_method]||'',job:profile.job_title||'',identity:profile.identity_no||'',addition:Number(line.manual_additions||0)||'',addition_reason:line.manual_additions_reason||'',deduction:Number(line.manual_deductions||0)||'',deduction_reason:line.manual_deductions_reason||'',source:person.key});});
      const header=ws.getRow(1);header.height=28;header.eachCell((cell)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:16}};
      const insuranceList=SOCIAL_INSURANCE_SCHEMES.map(([,label])=>label).join(',');const paymentList=PAYMENT_METHODS.map(([,label])=>label).join(',');
      for(let r=2;r<=ws.lastRow.number;r++){const row=ws.getRow(r);row.height=24;row.getCell(7).dataValidation={type:'list',allowBlank:true,formulae:[`"${insuranceList}"`]};row.getCell(10).dataValidation={type:'list',allowBlank:true,formulae:[`"${paymentList}"`]};row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};row.getCell(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};}
      const info=wb.addWorksheet('تعليمات');info.views=[{rightToLeft:true}];info.getColumn(1).width=110;info.getCell('A1').value='أدخل مكونات الراتب وفئة التأمينات. صافي الراتب يحسبه البرنامج تلقائيًا. الأجر الخاضع للاشتراك = الأساسي + بدل السكن؛ النقل والبدلات الأخرى غير خاضعة.';info.getCell('A1').alignment={wrapText:true,horizontal:'right'};
      downloadBuffer(await wb.xlsx.writeBuffer(),`بيانات_الرواتب_${activeImport.client_name_snapshot||'العميل'}_${dateOnly(activeImport.period_from)}.xlsx`);setMsg('تم تنزيل نموذج الرواتب.');
    }catch(e){setErr(e.message||String(e));}setBusy(false);
  }

  async function importSalaryFile(file){
    if(!file||!batch)return;setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const ws=wb.getWorksheet('بيانات الرواتب')||wb.worksheets[0];if(!ws)throw new Error('ملف الرواتب لا يحتوي بيانات.');
      const expected=['رقم الموظف','اسم الموظف','الراتب الأساسي','بدل السكن','بدل النقل','بدلات أخرى','فئة التأمينات','نسبة الموظف %','ساعات اليوم','طريقة الدفع','المسمى الوظيفي','الهوية / الإقامة','إضافة','سبب الإضافة','خصم','سبب الخصم','__source_key'];
      expected.forEach((label,index)=>{if(cellText(ws.getRow(1).getCell(index+1))!==label)throw new Error('بنية الملف غير مطابقة. استخدم النموذج الصادر من البرنامج.');});
      let changed=0;
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r);const key=cellText(row.getCell(17));if(!key)continue;const line=lineByKey.get(key);const profile=profileByKey.get(key);if(!line||!profile)continue;
        const scheme=insuranceValue(cellText(row.getCell(7)));const payment=paymentValue(cellText(row.getCell(10)));
        const pq=await supabase.from('hr_client_external_employee_profiles').update({display_employee_no:cellText(row.getCell(1))||profile.display_employee_no||null,display_name:cellText(row.getCell(2))||profile.display_name,job_title:cellText(row.getCell(11))||null,identity_no:cellText(row.getCell(12))||null,default_payment_method:payment||profile.default_payment_method||null,social_insurance_scheme:scheme||profile.social_insurance_scheme||null,updated_at:new Date().toISOString()}).eq('id',profile.id);if(pq.error)throw pq.error;
        const draftLine={...line,basic_salary:numberOrNull(cellText(row.getCell(3))),housing_allowance:numberOrNull(cellText(row.getCell(4))),transport_allowance:numberOrNull(cellText(row.getCell(5))),other_allowances:numberOrNull(cellText(row.getCell(6))),gosi_employee_rate_override:numberOrNull(cellText(row.getCell(8)))};
        const breakdown=salaryBreakdown({line:draftLine,profile:{...profile,social_insurance_scheme:scheme||profile.social_insurance_scheme},periodFrom:activeImport?.period_from});
        const lq=await supabase.from('hr_external_payroll_lines').update({reference_net_salary:breakdown.ready?breakdown.referenceNetSalary:null,basic_salary:draftLine.basic_salary,housing_allowance:draftLine.housing_allowance,transport_allowance:draftLine.transport_allowance,other_allowances:draftLine.other_allowances,gosi_employee_rate_override:draftLine.gosi_employee_rate_override,day_hours_override:numberOrNull(cellText(row.getCell(9))),payment_method:payment||line.payment_method||null,manual_additions:Number(numberOrNull(cellText(row.getCell(13)))||0),manual_additions_reason:cellText(row.getCell(14))||null,manual_deductions:Number(numberOrNull(cellText(row.getCell(15)))||0),manual_deductions_reason:cellText(row.getCell(16))||null,updated_at:new Date().toISOString()}).eq('id',line.id);if(lq.error)throw lq.error;changed+=1;
      }
      await loadActive(activeId);setMsg(`تم استيراد بيانات ${changed} موظف.`);
    }catch(e){setErr(e.message||String(e));setBusy(false);}if(salaryFileRef.current)salaryFileRef.current.value='';
  }

  async function uploadLetterhead(file){
    if(!file||!batch)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setErr('المطبوعات: PNG أو JPG أو WEBP.');return;}
    setBusy(true);setErr('');setMsg('');
    try{const ext=(file.name.split('.').pop()||'png').toLowerCase();const path=`external-payroll/${safePart(batch.client_key)}/letterhead-${Date.now()}.${ext}`;const up=await supabase.storage.from('brand').upload(path,file,{cacheControl:'31536000',upsert:false,contentType:file.type});if(up.error)throw up.error;const q=await supabase.from('hr_external_payroll_batches').update({client_letterhead_path:path,updated_at:new Date().toISOString()}).eq('id',batch.id).select('*').single();if(q.error)throw q.error;setBatch(q.data);setMsg('تم حفظ مطبوعات العميل.');}catch(e){setErr(e.message||String(e));}setBusy(false);if(letterheadRef.current)letterheadRef.current.value='';
  }

  async function calculateAll(){
    if(!batch||!activeImport)return;if(salaryMissingCount>0){setErr(`أكمل بيانات الراتب والتأمينات لـ ${salaryMissingCount} موظف.`);return;}const saved=dirty?await saveInputs(false):true;if(!saved)return;
    setBusy(true);setErr('');setMsg('');let completed=0;const incomplete=[];const refreshed=[];
    try{
      for(const line of lines){const profile=profileByKey.get(line.source_employee_key)||{};const calc=calculateExternalPayroll({days:daysByKey.get(line.source_employee_key)||[],line,batch,profile,periodFrom:activeImport.period_from,periodTo:activeImport.period_to});if(!calc.ready){incomplete.push(`${profile.display_name||line.source_employee_key}: ${calc.reason}`);refreshed.push(line);continue;}
        const q=await supabase.from('hr_external_payroll_lines').update({reference_net_salary:calc.referenceNetSalary,payment_method:calc.paymentMethod,calculated_gross_salary:calc.grossSalary,calculated_contributory_wage:calc.contributoryWage,calculated_gosi_employee_rate:calc.gosiEmployeeRate,calculated_gosi_employee_deduction:calc.gosiEmployeeDeduction,calculated_divisor_days:calc.divisorDays,calculated_day_hours:calc.dayHours,calculated_day_value:calc.dayValue,calculated_hour_value:calc.hourValue,calculated_absence_days:calc.absenceDays,calculated_missing_punch_days:calc.missingPunchDays,calculated_missing_in_count:calc.missingInCount,calculated_missing_out_count:calc.missingOutCount,calculated_extra_minutes:calc.extraMinutes,calculated_short_minutes:calc.shortMinutes,calculated_net_minutes:calc.netMinutes,calculated_absence_amount:calc.absenceAmount,calculated_missing_punch_amount:calc.missingPunchAmount,calculated_time_amount:calc.timeAmount,calculated_total_additions:calc.totalAdditions,calculated_total_deductions:calc.totalDeductions,calculated_final_net_salary:calc.finalNetSalary,calculation_snapshot:calc.snapshot,calculated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',line.id).select('*').single();if(q.error)throw q.error;refreshed.push(q.data);completed+=1;}
      const bq=await supabase.from('hr_external_payroll_batches').update({status:incomplete.length?'draft':'calculated',updated_at:new Date().toISOString()}).eq('id',batch.id).select('*').single();if(bq.error)throw bq.error;setBatch(bq.data);setLines(refreshed);if(incomplete.length)setErr(`تم احتساب ${completed}. متبقي ${incomplete.length}: ${incomplete.slice(0,3).join(' | ')}`);else setMsg(`تم احتساب ${completed} موظف.`);
    }catch(e){setErr(e.message||String(e));}setBusy(false);
  }

  const totals=useMemo(()=>people.reduce((acc,person)=>{
    const line=lineByKey.get(person.key)||{};const breakdown=salaryStateByKey.get(person.key);if(breakdown?.ready)acc.reference+=Number(breakdown.referenceNetSalary||0);acc.additions+=Number(line.calculated_total_additions||0);acc.deductions+=Number(line.calculated_total_deductions||0);acc.final+=Number(line.calculated_final_net_salary||0);return acc;
  },{reference:0,additions:0,deductions:0,final:0}),[people,lineByKey,salaryStateByKey]);

  return <div>
    <div className="page-head"><div><h1>الرواتب</h1></div><Link className="btn ghost" href={externalStageHref('/dashboard/attendance/external-review',activeId)}>المراجعة</Link></div>
    {err&&<div className="msg err" style={{marginTop:12}}>{err}</div>}{msg&&<div className="msg ok" style={{marginTop:12}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}><header><h2>الحالي</h2></header><div style={{padding:18}}>
      {activeImport?<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong style={{fontSize:16}}>{activeImport.client_name_snapshot||'عميل خارجي'}</strong><div className="hint" style={{marginTop:4}}>{dateOnly(activeImport.period_from)} — {dateOnly(activeImport.period_to)}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="tag">{payrollMonthLabel(activeImport.period_from)}</span><span className="tag">{people.length} موظف</span><span className="tag">مكتمل {salaryReadyCount}/{people.length}</span></div></div>:<strong>لا توجد دفعة حالية.</strong>}
      {drafts.length>0&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:700}}>المسودات ({drafts.length})</summary><div style={{display:'grid',gap:8,marginTop:10}}>{drafts.map((item)=><button key={item.id} type="button" className="btn ghost" style={{justifyContent:'space-between',textAlign:'right'}} onClick={()=>chooseBatch(item.id)}><span>{batchLabel(item)}</span><span>فتح</span></button>)}</div></details>}
    </div></div>

    {batch&&<>
      <div className="section"><header><h2>بيانات الرواتب</h2><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn ghost" disabled={busy} onClick={exportSalaryTemplate}>تنزيل نموذج Excel</button><button className="btn ghost" disabled={busy} onClick={()=>salaryFileRef.current?.click()}>استيراد Excel</button><input ref={salaryFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importSalaryFile(e.target.files?.[0])}/><button className="btn" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ</button></div></header><div style={{padding:18,overflowX:'auto'}}><table><thead><tr><th>الرقم</th><th>الموظف</th><th>الأساسي</th><th>السكن</th><th>النقل</th><th>بدلات أخرى</th><th>التأمينات</th><th>صافي الراتب</th><th>ساعات اليوم</th><th>طريقة الدفع</th><th>تفاصيل</th></tr></thead><tbody>{people.map((person)=>{
        const line=lineByKey.get(person.key);const profile=profileByKey.get(person.key);if(!line||!profile)return null;const inferred=inferDayHours(daysByKey.get(person.key)||[]);const breakdown=salaryStateByKey.get(person.key)||{};
        return <tr key={person.key}><td><strong>{profile.display_employee_no||person.no||'—'}</strong></td><td><strong>{profile.display_name||person.name}</strong>{profile.display_name!==profile.source_employee_name&&profile.source_employee_name?<div className="hint">{profile.source_employee_name}</div>:null}</td>
          <td><input type="number" min="0" step="0.01" value={line.basic_salary??''} onChange={(e)=>setLineField(line.id,'basic_salary',e.target.value)} style={{minWidth:100}}/></td><td><input type="number" min="0" step="0.01" value={line.housing_allowance??''} onChange={(e)=>setLineField(line.id,'housing_allowance',e.target.value)} style={{minWidth:90}}/></td><td><input type="number" min="0" step="0.01" value={line.transport_allowance??''} onChange={(e)=>setLineField(line.id,'transport_allowance',e.target.value)} style={{minWidth:90}}/></td><td><input type="number" min="0" step="0.01" value={line.other_allowances??''} onChange={(e)=>setLineField(line.id,'other_allowances',e.target.value)} style={{minWidth:100}}/></td>
          <td><select value={profile.social_insurance_scheme||''} onChange={(e)=>setProfileField(profile.id,'social_insurance_scheme',e.target.value||null)} style={{minWidth:180}}><option value="">اختر</option>{SOCIAL_INSURANCE_SCHEMES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{profile.social_insurance_scheme==='manual'&&<input type="number" min="0" max="100" step="0.01" placeholder="نسبة الموظف %" value={line.gosi_employee_rate_override??''} onChange={(e)=>setLineField(line.id,'gosi_employee_rate_override',e.target.value)} style={{minWidth:120,marginTop:6}}/>}</td>
          <td><strong>{breakdown.ready?`${formatMoney(breakdown.referenceNetSalary)} ر.س`:'—'}</strong>{!breakdown.ready&&<div className="hint">{breakdown.reason}</div>}</td>
          <td><input type="number" min="0.5" step="0.25" placeholder={inferred?String(inferred):'—'} value={line.day_hours_override??''} onChange={(e)=>setLineField(line.id,'day_hours_override',e.target.value)} style={{minWidth:85}}/></td><td><select value={line.payment_method||''} onChange={(e)=>setLineField(line.id,'payment_method',e.target.value||null)} style={{minWidth:140}}><option value="">{batch.default_payment_method?`افتراضي: ${PAYMENT_METHOD_LABEL[batch.default_payment_method]}`:'اختر'}</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td><button className="btn ghost" onClick={()=>openProfile(person.key)}>فتح</button></td></tr>;
      })}</tbody></table><div className="rowsplit" style={{marginTop:12}}><span className="hint">صافي الراتب = الأساسي + البدلات − حصة الموظف في التأمينات. الأجر الخاضع للاشتراك: الأساسي + السكن.</span>{salaryMissingCount>0?<strong style={{color:'#8B2E2E'}}>متبقي {salaryMissingCount}</strong>:<strong>مكتمل</strong>}</div></div></div>

      <div className="section"><header><h2>سياسة الاحتساب</h2></header><div style={{padding:18}}><div className="form-grid"><div className="field"><label>قيمة اليوم</label><select value={batch.divisor_policy} onChange={(e)=>setBatchField('divisor_policy',e.target.value)}><option value="thirty">الراتب ÷ 30</option><option value="calendar_days">الراتب ÷ أيام الشهر</option></select></div><div className="field"><label>الرصيد الزائد للساعات</label><select value={batch.positive_time_policy} onChange={(e)=>setBatchField('positive_time_policy',e.target.value)}><option value="pay_net">يضاف للمستحق</option><option value="offset_only">يعوض النقص فقط</option></select></div><div className="field"><label>جزاء البصمة المفقودة</label><div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" min="0" step="0.25" value={batch.missing_punch_deduction_days} onChange={(e)=>setBatchField('missing_punch_deduction_days',e.target.value)}/><span className="hint">يوم / حالة مرفوضة</span></div></div><div className="field"><label>طريقة الدفع الافتراضية</label><select value={batch.default_payment_method||''} onChange={(e)=>setBatchField('default_payment_method',e.target.value||null)}><option value="">لكل موظف</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn ghost" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ</button><button className="btn ghost" disabled={busy} onClick={()=>letterheadRef.current?.click()}>{batch.client_letterhead_path?'استبدال مطبوعات العميل':'رفع مطبوعات العميل'}</button><input ref={letterheadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e)=>uploadLetterhead(e.target.files?.[0])}/></div></div></div>

      <div className="section"><header><h2>احتساب المسير</h2></header><div style={{padding:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{salaryMissingCount===0?'جاهز للاحتساب':`أكمل بيانات ${salaryMissingCount} موظف`}</strong><button className="btn" disabled={busy||salaryMissingCount>0} onClick={calculateAll}>{busy?'جارٍ الاحتساب…':'احتساب الرواتب'}</button></div></div>

      {!dirty&&lines.some((line)=>line.calculated_at)&&<div className="section"><header><h2>مسير الرواتب</h2></header><div className="stat-grid" style={{padding:18}}><div className="stat"><span>صافي الراتب قبل الحضور</span><strong>{formatMoney(totals.reference)} ر.س</strong></div><div className="stat"><span>الإضافات</span><strong>{formatMoney(totals.additions)} ر.س</strong></div><div className="stat"><span>الخصومات</span><strong>{formatMoney(totals.deductions)} ر.س</strong></div><div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div></div><div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>الغياب</th><th>البصمات المفقودة</th><th>صافي الساعات</th><th>الإضافات</th><th>الخصومات</th><th>صافي المستحق</th><th>القسيمة</th></tr></thead><tbody>{people.map((person)=>{
        const line=lineByKey.get(person.key);const profile=profileByKey.get(person.key);if(!line||!profile||!line.calculated_at)return null;const calc=calculateExternalPayroll({days:daysByKey.get(person.key)||[],line,batch,profile,periodFrom:activeImport?.period_from,periodTo:activeImport?.period_to});const open=expanded===person.key;
        return <tr key={person.key} style={{verticalAlign:'top'}}><td><strong>{profile.display_name}</strong><div className="hint">{profile.display_employee_no||person.no||'—'}</div></td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.absenceDays} يوم`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:190}}>{calc.absenceDates.length?calc.absenceDates.join('، '):'لا يوجد'}</div>}</td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.missingPunchDays} حالة`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:210}}>دخول {calc.missingInCount} · خروج {calc.missingOutCount}{calc.missingPunchDates.length?<><br/>{calc.missingPunchDates.map((x)=>`${x.date} ${x.kind==='missing_in'?'(دخول)':'(خروج)'}`).join('، ')}</>:null}</div>}</td><td>{calc.ready?<strong>{formatMinutesSigned(calc.netMinutes)}</strong>:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalAdditions)} ر.س`:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalDeductions)} ر.س`:'—'}</td><td><strong>{calc.ready?`${formatMoney(calc.finalNetSalary)} ر.س`:'—'}</strong></td><td><Link className="btn" href={`/dashboard/attendance/payroll/${batch.id}/payslip/${line.id}`} target="_blank">قسيمة الراتب</Link></td></tr>;
      })}</tbody></table></div></div>}
    </>}

    {profileDraft&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.4)',display:'grid',placeItems:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy){setProfileDraft(null);setEditKey('');}}}><div className="section" style={{width:'min(760px,96vw)',maxHeight:'90vh',overflow:'auto',background:'#fff',margin:0}}><header><h2>بيانات الموظف</h2><button className="btn ghost" onClick={()=>{setProfileDraft(null);setEditKey('');}}>إغلاق</button></header><div style={{padding:18}}><div className="form-grid"><div className="field"><label>الاسم</label><input value={profileDraft.display_name||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_name:e.target.value}))}/><span className="hint">المصدر: {profileDraft.source_employee_name||'—'}</span></div><div className="field"><label>الرقم الوظيفي</label><input value={profileDraft.display_employee_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,display_employee_no:e.target.value}))}/></div><div className="field"><label>المسمى الوظيفي</label><input value={profileDraft.job_title||''} onChange={(e)=>setProfileDraft((p)=>({...p,job_title:e.target.value}))}/></div><div className="field"><label>الهوية / الإقامة</label><input value={profileDraft.identity_no||''} onChange={(e)=>setProfileDraft((p)=>({...p,identity_no:e.target.value}))}/></div><div className="field"><label>إضافة</label><input type="number" min="0" step="0.01" value={profileDraft.manual_additions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions:e.target.value}))}/><input placeholder="السبب" style={{marginTop:7}} value={profileDraft.manual_additions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_additions_reason:e.target.value}))}/></div><div className="field"><label>خصم</label><input type="number" min="0" step="0.01" value={profileDraft.manual_deductions??0} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions:e.target.value}))}/><input placeholder="السبب" style={{marginTop:7}} value={profileDraft.manual_deductions_reason||''} onChange={(e)=>setProfileDraft((p)=>({...p,manual_deductions_reason:e.target.value}))}/></div><div className="field"><label>طريقة الدفع</label><select value={profileDraft.default_payment_method||''} onChange={(e)=>setProfileDraft((p)=>({...p,default_payment_method:e.target.value||null}))}><option value="">بدون افتراضي</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><div style={{display:'flex',gap:16,marginTop:14,flexWrap:'wrap'}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_job_title} onChange={(e)=>setProfileDraft((p)=>({...p,show_job_title:e.target.checked}))}/> إظهار المسمى</label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_identity} onChange={(e)=>setProfileDraft((p)=>({...p,show_identity:e.target.checked}))}/> إظهار الهوية / الإقامة</label></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="btn ghost" disabled={busy} onClick={()=>{setProfileDraft(null);setEditKey('');}}>إلغاء</button><button className="btn" disabled={busy} onClick={saveProfile}>{busy?'جارٍ الحفظ…':'حفظ'}</button></div></div></div></div>}
  </div>;
}
