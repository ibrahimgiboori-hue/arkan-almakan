'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { externalStageHref, getCurrentExternalImportId, setCurrentExternalImportId } from '@/lib/attendance/current-external-import';
import { externalPayrollWorkspaceService } from '@/lib/application/external-payroll-workspace-service';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  NATIONALITY_CATEGORIES,
  NATIONALITY_CATEGORY_LABEL,
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

const YES_NO=[['yes','نعم'],['no','لا']];

function dateOnly(value){return value?String(value).slice(0,10):'';}
function numberOrNull(value){if(value===''||value==null)return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
function cellText(cell){const value=cell?.value;if(value==null)return '';if(typeof value==='object'&&value.text!=null)return String(value.text).trim();if(typeof value==='object'&&value.result!=null)return String(value.result).trim();return String(value).trim();}
function paymentValue(value){const text=String(value||'').trim();return PAYMENT_METHODS.find(([key,label])=>text===key||text===label)?.[0]||null;}
function nationalityValue(value){const text=String(value||'').trim();return NATIONALITY_CATEGORIES.find(([key,label])=>text===key||text===label)?.[0]||null;}
function insuranceSchemeValue(value){const text=String(value||'').trim();return SOCIAL_INSURANCE_SCHEMES.find(([key,label])=>text===key||text===label)?.[0]||null;}
function insuranceActiveValue(value){const text=String(value||'').trim().toLowerCase();if(['نعم','yes','true','1'].includes(text))return true;if(['لا','no','false','0'].includes(text))return false;return null;}
function batchLabel(item){return `${item.client_name_snapshot||'عميل خارجي'} — ${dateOnly(item.period_from)} إلى ${dateOnly(item.period_to)}`;}
function downloadBuffer(buffer,filename){const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}

export default function ExternalPayrollWorkspaceEngineered(){
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
  const profileByKey=useMemo(()=>new Map(profiles.map((profile)=>[profile.source_employee_key,profile])),[profiles]);
  const lineByKey=useMemo(()=>new Map(lines.map((line)=>[line.source_employee_key,line])),[lines]);
  const salaryState=useMemo(()=>people.map((person)=>({key:person.key,...salaryBreakdown({line:lineByKey.get(person.key)||{},profile:profileByKey.get(person.key)||{},periodFrom:activeImport?.period_from})})),[people,lineByKey,profileByKey,activeImport?.period_from]);
  const salaryStateByKey=useMemo(()=>new Map(salaryState.map((item)=>[item.key,item])),[salaryState]);
  const salaryReadyCount=salaryState.filter((item)=>item.ready).length;
  const salaryMissingCount=Math.max(0,people.length-salaryReadyCount);
  const showTimeDifference=batch?.include_overtime!==false||batch?.include_time_shortage!==false;

  async function loadImports(){
    try{
      const list=await externalPayrollWorkspaceService.listReadyImports(30);
      setImports(list);
      const urlId=searchParams.get('batch')||'';
      const remembered=getCurrentExternalImportId();
      setActiveId((current)=>[urlId,current,remembered].find((id)=>id&&list.some((item)=>item.id===id))||list[0]?.id||'');
    }catch(error){setErr(error.message||String(error));}
  }

  async function loadActive(id,list=imports){
    const item=list.find((entry)=>entry.id===id);if(!item)return;
    setBusy(true);setErr('');setMsg('');setBatch(null);setLines([]);setProfiles([]);setDirty(false);
    try{
      const workspace=await externalPayrollWorkspaceService.loadWorkspace(item);
      setDays(workspace.days);setBatch(workspace.batch);setProfiles(workspace.profiles);setLines(workspace.lines);
    }catch(error){setErr(error.message||String(error));}
    finally{setBusy(false);}
  }

  useEffect(()=>{loadImports();},[]);
  useEffect(()=>{if(activeId&&imports.length){setCurrentExternalImportId(activeId);loadActive(activeId,imports);}},[activeId,imports.length]);

  function chooseBatch(id){setActiveId(id);setCurrentExternalImportId(id);}
  function setBatchField(field,value){setBatch((current)=>({...current,[field]:value}));setDirty(true);}
  function setLineField(id,field,value){setLines((list)=>list.map((line)=>line.id===id?{...line,[field]:value}:line));setDirty(true);}
  function setProfileField(id,field,value){setProfiles((list)=>list.map((profile)=>profile.id===id?{...profile,[field]:value}:profile));setDirty(true);}
  function setNationality(profileId,value){setProfiles((list)=>list.map((profile)=>{if(profile.id!==profileId)return profile;if(value==='saudi')return {...profile,nationality_category:value,social_insurance_scheme:['saudi_legacy','saudi_new'].includes(profile.social_insurance_scheme)?profile.social_insurance_scheme:'saudi_legacy'};if(value==='gcc')return {...profile,nationality_category:value,social_insurance_scheme:'manual'};return {...profile,nationality_category:value,social_insurance_scheme:null};}));setDirty(true);}
  function setInsuranceActive(profileId,checked){setProfiles((list)=>list.map((profile)=>{if(profile.id!==profileId)return profile;let scheme=profile.social_insurance_scheme;if(checked&&profile.nationality_category==='saudi'&&!['saudi_legacy','saudi_new'].includes(scheme))scheme='saudi_legacy';if(checked&&profile.nationality_category==='gcc')scheme='manual';if(checked&&profile.nationality_category==='non_saudi')scheme=null;return {...profile,social_insurance_active:checked,social_insurance_scheme:scheme};}));setDirty(true);}

  async function saveInputs(showMessage=true){
    if(!batch)return false;setBusy(true);setErr('');if(showMessage)setMsg('');
    try{
      await externalPayrollWorkspaceService.saveInputs({batch,people,profiles,lines,periodFrom:activeImport?.period_from});
      setLines((list)=>list.map((line)=>({...line,calculated_at:null,calculated_final_net_salary:null,calculation_snapshot:{}})));
      setDirty(false);if(showMessage)setMsg('تم الحفظ. أعد احتساب الرواتب.');return true;
    }catch(error){setErr(error.message||String(error));return false;}
    finally{setBusy(false);}
  }

  function openProfile(key){const profile=profileByKey.get(key);const line=lineByKey.get(key);if(!profile||!line)return;setEditKey(key);setProfileDraft({...profile,show_job_title:!!line.show_job_title,show_identity:!!line.show_identity,manual_additions:line.manual_additions??0,manual_additions_reason:line.manual_additions_reason||'',manual_deductions:line.manual_deductions??0,manual_deductions_reason:line.manual_deductions_reason||'',gosi_employee_rate_override:line.gosi_employee_rate_override??''});}

  async function saveProfile(){
    const draft=profileDraft;const line=lineByKey.get(editKey);if(!draft||!line)return;if(!String(draft.display_name||'').trim()){setErr('اسم الموظف مطلوب.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const saved=await externalPayrollWorkspaceService.saveProfile({draft,line});
      setProfiles((list)=>list.map((profile)=>profile.id===draft.id?saved.profile:profile));
      setLines((list)=>list.map((item)=>item.id===line.id?saved.line:item));
      setEditKey('');setProfileDraft(null);setDirty(false);setMsg('تم الحفظ. أعد احتساب الرواتب.');
    }catch(error){setErr(error.message||String(error));}
    finally{setBusy(false);}
  }

  async function exportSalaryTemplate(){
    if(!activeImport)return;setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('بيانات الرواتب',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:16},{header:'اسم الموظف',key:'name',width:30},{header:'الجنسية',key:'nationality',width:16},{header:'مسجل في التأمينات',key:'insured',width:19},{header:'نظام الاشتراك',key:'scheme',width:18},{header:'نسبة الموظف %',key:'rate',width:16},{header:'الراتب الأساسي',key:'basic',width:18},{header:'بدل السكن',key:'housing',width:16},{header:'بدل النقل',key:'transport',width:16},{header:'بدلات أخرى',key:'other',width:16},{header:'ساعات اليوم',key:'hours',width:14},{header:'طريقة الدفع',key:'payment',width:22},{header:'المسمى الوظيفي',key:'job',width:24},{header:'الهوية / الإقامة',key:'identity',width:20},{header:'إضافة',key:'addition',width:14},{header:'سبب الإضافة',key:'addition_reason',width:26},{header:'خصم',key:'deduction',width:14},{header:'سبب الخصم',key:'deduction_reason',width:26},{header:'__source_key',key:'source',hidden:true},
      ];
      people.forEach((person)=>{const profile=profileByKey.get(person.key)||{};const line=lineByKey.get(person.key)||{};ws.addRow({no:profile.display_employee_no||person.no,name:profile.display_name||person.name,nationality:NATIONALITY_CATEGORY_LABEL[profile.nationality_category]||'',insured:profile.social_insurance_active?'نعم':'لا',scheme:profile.social_insurance_active?(SOCIAL_INSURANCE_SCHEME_LABEL[profile.social_insurance_scheme]||''):'',rate:line.gosi_employee_rate_override??'',basic:line.basic_salary??'',housing:line.housing_allowance??'',transport:line.transport_allowance??'',other:line.other_allowances??'',hours:line.day_hours_override??'',payment:PAYMENT_METHOD_LABEL[line.payment_method||profile.default_payment_method||batch?.default_payment_method]||'',job:profile.job_title||'',identity:profile.identity_no||'',addition:Number(line.manual_additions||0)||'',addition_reason:line.manual_additions_reason||'',deduction:Number(line.manual_deductions||0)||'',deduction_reason:line.manual_deductions_reason||'',source:person.key});});
      const header=ws.getRow(1);header.height=28;header.eachCell((cell)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});ws.autoFilter={from:{row:1,column:1},to:{row:1,column:18}};
      const nationalityList=NATIONALITY_CATEGORIES.map(([,label])=>label).join(',');const yesNoList=YES_NO.map(([,label])=>label).join(',');const schemeList=SOCIAL_INSURANCE_SCHEMES.map(([,label])=>label).join(',');const paymentList=PAYMENT_METHODS.map(([,label])=>label).join(',');
      for(let r=2;r<=ws.lastRow.number;r++){const row=ws.getRow(r);row.height=24;row.getCell(3).dataValidation={type:'list',allowBlank:false,formulae:[`"${nationalityList}"`]};row.getCell(4).dataValidation={type:'list',allowBlank:false,formulae:[`"${yesNoList}"`]};row.getCell(5).dataValidation={type:'list',allowBlank:true,formulae:[`"${schemeList}"`]};row.getCell(12).dataValidation={type:'list',allowBlank:true,formulae:[`"${paymentList}"`]};row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};row.getCell(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F9'}};}
      const info=wb.addWorksheet('تعليمات');info.views=[{rightToLeft:true}];info.getColumn(1).width=115;info.getCell('A1').value='أدخل الجنسية ومكونات الراتب. فعّل «مسجل في التأمينات» فقط للمشترك المسجل. صافي الراتب يحسبه البرنامج. الأجر الخاضع للاشتراك = الأساسي + بدل السكن.';info.getCell('A1').alignment={wrapText:true,horizontal:'right'};
      downloadBuffer(await wb.xlsx.writeBuffer(),`بيانات_الرواتب_${activeImport.client_name_snapshot||'العميل'}_${dateOnly(activeImport.period_from)}.xlsx`);setMsg('تم تنزيل نموذج الرواتب.');
    }catch(error){setErr(error.message||String(error));}
    finally{setBusy(false);}
  }

  async function importSalaryFile(file){
    if(!file||!batch)return;setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const ws=wb.getWorksheet('بيانات الرواتب')||wb.worksheets[0];if(!ws)throw new Error('ملف الرواتب لا يحتوي بيانات.');
      const expected=['رقم الموظف','اسم الموظف','الجنسية','مسجل في التأمينات','نظام الاشتراك','نسبة الموظف %','الراتب الأساسي','بدل السكن','بدل النقل','بدلات أخرى','ساعات اليوم','طريقة الدفع','المسمى الوظيفي','الهوية / الإقامة','إضافة','سبب الإضافة','خصم','سبب الخصم','__source_key'];expected.forEach((label,index)=>{if(cellText(ws.getRow(1).getCell(index+1))!==label)throw new Error('بنية الملف غير مطابقة. استخدم النموذج الصادر من البرنامج.');});
      let changed=0;
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r);const key=cellText(row.getCell(19));if(!key)continue;const line=lineByKey.get(key);const profile=profileByKey.get(key);if(!line||!profile)continue;
        const nationality=nationalityValue(cellText(row.getCell(3)));const insured=insuranceActiveValue(cellText(row.getCell(4)));let scheme=insuranceSchemeValue(cellText(row.getCell(5)));const payment=paymentValue(cellText(row.getCell(12)));
        if(!nationality)throw new Error(`صف ${r}: حدد الجنسية.`);if(insured===null)throw new Error(`صف ${r}: حدد هل الموظف مسجل في التأمينات.`);if(insured&&nationality==='saudi'&&!['saudi_legacy','saudi_new'].includes(scheme))throw new Error(`صف ${r}: اختر نظام اشتراك الموظف السعودي.`);if(insured&&nationality==='gcc')scheme='manual';if(nationality==='non_saudi')scheme=null;
        await externalPayrollWorkspaceService.saveImportedRow({profile,line,periodFrom:activeImport?.period_from,profilePatch:{display_employee_no:cellText(row.getCell(1))||profile.display_employee_no||null,display_name:cellText(row.getCell(2))||profile.display_name,job_title:cellText(row.getCell(13))||null,identity_no:cellText(row.getCell(14))||null,default_payment_method:payment||profile.default_payment_method||null,nationality_category:nationality,social_insurance_active:insured,social_insurance_scheme:insured?scheme:null},linePatch:{basic_salary:numberOrNull(cellText(row.getCell(7))),housing_allowance:numberOrNull(cellText(row.getCell(8))),transport_allowance:numberOrNull(cellText(row.getCell(9))),other_allowances:numberOrNull(cellText(row.getCell(10))),gosi_employee_rate_override:numberOrNull(cellText(row.getCell(6))),day_hours_override:numberOrNull(cellText(row.getCell(11))),payment_method:payment||line.payment_method||null,manual_additions:Number(numberOrNull(cellText(row.getCell(15)))||0),manual_additions_reason:cellText(row.getCell(16))||null,manual_deductions:Number(numberOrNull(cellText(row.getCell(17)))||0),manual_deductions_reason:cellText(row.getCell(18))||null}});changed+=1;
      }
      await loadActive(activeId);setMsg(`تم استيراد بيانات ${changed} موظف. أعد احتساب الرواتب.`);
    }catch(error){setErr(error.message||String(error));}
    finally{setBusy(false);if(salaryFileRef.current)salaryFileRef.current.value='';}
  }

  async function uploadLetterhead(file){
    if(!file||!batch)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setErr('المطبوعات: PNG أو JPG أو WEBP.');return;}
    setBusy(true);setErr('');setMsg('');
    try{const updated=await externalPayrollWorkspaceService.uploadLetterhead({batch,file});setBatch(updated);setMsg('تم حفظ مطبوعات العميل.');}catch(error){setErr(error.message||String(error));}finally{setBusy(false);if(letterheadRef.current)letterheadRef.current.value='';}
  }

  async function calculateAll(){
    if(!batch||!activeImport)return;if(salaryMissingCount>0){setErr(`أكمل بيانات الراتب والجنسية والتأمينات لـ ${salaryMissingCount} موظف.`);return;}const saved=dirty?await saveInputs(false):true;if(!saved)return;
    setBusy(true);setErr('');setMsg('');let completed=0;const incomplete=[];const refreshed=[];
    try{
      for(const line of lines){const profile=profileByKey.get(line.source_employee_key)||{};const calc=calculateExternalPayroll({days:daysByKey.get(line.source_employee_key)||[],line,batch,profile,periodFrom:activeImport.period_from,periodTo:activeImport.period_to});if(!calc.ready){incomplete.push(`${profile.display_name||line.source_employee_key}: ${calc.reason}`);refreshed.push(line);continue;}refreshed.push(await externalPayrollWorkspaceService.persistCalculation({lineId:line.id,calculation:calc}));completed+=1;}
      const updatedBatch=await externalPayrollWorkspaceService.finishCalculation({batchId:batch.id,incompleteCount:incomplete.length});setBatch(updatedBatch);setLines(refreshed);if(incomplete.length)setErr(`تم احتساب ${completed}. متبقي ${incomplete.length}: ${incomplete.slice(0,3).join(' | ')}`);else setMsg(`تم احتساب ${completed} موظف.`);
    }catch(error){setErr(error.message||String(error));}
    finally{setBusy(false);}
  }

  const totals=useMemo(()=>people.reduce((acc,person)=>{const line=lineByKey.get(person.key)||{};const breakdown=salaryStateByKey.get(person.key);if(breakdown?.ready)acc.reference+=Number(breakdown.referenceNetSalary||0);acc.additions+=Number(line.calculated_total_additions||0);acc.deductions+=Number(line.calculated_total_deductions||0);acc.final+=Number(line.calculated_final_net_salary||0);return acc;},{reference:0,additions:0,deductions:0,final:0}),[people,lineByKey,salaryStateByKey]);

  return <div>
    <div className="page-head"><div><h1>الرواتب</h1></div><Link className="btn ghost" href={externalStageHref('/dashboard/attendance/external-review',activeId)}>المراجعة</Link></div>
    {err&&<div className="msg err" style={{marginTop:12}}>{err}</div>}{msg&&<div className="msg ok" style={{marginTop:12}}>{msg}</div>}
    <div className="section" style={{marginTop:16}}><header><h2>الحالي</h2></header><div style={{padding:18}}>{activeImport?<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong style={{fontSize:16}}>{activeImport.client_name_snapshot||'عميل خارجي'}</strong><div className="hint" style={{marginTop:4}}>{dateOnly(activeImport.period_from)} — {dateOnly(activeImport.period_to)}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="tag">{payrollMonthLabel(activeImport.period_from)}</span><span className="tag">{people.length} موظف</span><span className="tag">مكتمل {salaryReadyCount}/{people.length}</span></div></div>:<strong>لا توجد دفعة حالية.</strong>}{drafts.length>0&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:700}}>المسودات ({drafts.length})</summary><div style={{display:'grid',gap:8,marginTop:10}}>{drafts.map((item)=><button key={item.id} type="button" className="btn ghost" style={{justifyContent:'space-between',textAlign:'right'}} onClick={()=>chooseBatch(item.id)}><span>{batchLabel(item)}</span><span>فتح</span></button>)}</div></details>}</div></div>

    {batch&&<>
      <div className="section"><header><h2>بيانات الرواتب</h2><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn ghost" disabled={busy} onClick={exportSalaryTemplate}>تنزيل نموذج Excel</button><button className="btn ghost" disabled={busy} onClick={()=>salaryFileRef.current?.click()}>استيراد Excel</button><input ref={salaryFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importSalaryFile(e.target.files?.[0])}/><button className="btn" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ</button></div></header><div style={{padding:18,overflowX:'auto'}}><table><thead><tr><th>الرقم</th><th>الموظف</th><th>الجنسية</th><th>التأمينات</th><th>الأساسي</th><th>السكن</th><th>النقل</th><th>بدلات أخرى</th><th>خصم التأمينات</th><th>صافي الراتب</th><th>ساعات اليوم</th><th>طريقة الدفع</th><th>تفاصيل</th></tr></thead><tbody>{people.map((person)=>{const line=lineByKey.get(person.key);const profile=profileByKey.get(person.key);if(!line||!profile)return null;const inferred=inferDayHours(daysByKey.get(person.key)||[]);const breakdown=salaryStateByKey.get(person.key)||{};return <tr key={person.key}><td><strong>{profile.display_employee_no||person.no||'—'}</strong></td><td><strong>{profile.display_name||person.name}</strong>{profile.display_name!==profile.source_employee_name&&profile.source_employee_name?<div className="hint">{profile.source_employee_name}</div>:null}</td><td><select value={profile.nationality_category||''} onChange={(e)=>setNationality(profile.id,e.target.value||null)} style={{minWidth:120}}><option value="">اختر</option>{NATIONALITY_CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td style={{minWidth:180}}><label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={!!profile.social_insurance_active} onChange={(e)=>setInsuranceActive(profile.id,e.target.checked)}/> مسجل</label>{profile.social_insurance_active&&profile.nationality_category==='saudi'&&<select value={profile.social_insurance_scheme||'saudi_legacy'} onChange={(e)=>setProfileField(profile.id,'social_insurance_scheme',e.target.value)} style={{minWidth:150,marginTop:6}}><option value="saudi_legacy">النظام القائم</option><option value="saudi_new">النظام الجديد</option></select>}{profile.social_insurance_active&&profile.nationality_category==='gcc'&&<input type="number" min="0" max="100" step="0.01" placeholder="نسبة الموظف %" value={line.gosi_employee_rate_override??''} onChange={(e)=>setLineField(line.id,'gosi_employee_rate_override',e.target.value)} style={{minWidth:130,marginTop:6}}/>}{profile.social_insurance_active&&profile.nationality_category==='non_saudi'&&<div className="hint" style={{marginTop:5}}>حصة الموظف 0%</div>}</td><td><input type="number" min="0" step="0.01" value={line.basic_salary??''} onChange={(e)=>setLineField(line.id,'basic_salary',e.target.value)} style={{minWidth:100}}/></td><td><input type="number" min="0" step="0.01" value={line.housing_allowance??''} onChange={(e)=>setLineField(line.id,'housing_allowance',e.target.value)} style={{minWidth:90}}/></td><td><input type="number" min="0" step="0.01" value={line.transport_allowance??''} onChange={(e)=>setLineField(line.id,'transport_allowance',e.target.value)} style={{minWidth:90}}/></td><td><input type="number" min="0" step="0.01" value={line.other_allowances??''} onChange={(e)=>setLineField(line.id,'other_allowances',e.target.value)} style={{minWidth:100}}/></td><td><strong>{breakdown.ready?`${formatMoney(breakdown.gosiEmployeeDeduction)} ر.س`:'—'}</strong>{breakdown.ready&&<div className="hint">{breakdown.socialInsuranceActive?`${Number(breakdown.gosiEmployeeRate||0).toFixed(2)}%`:'غير مطبق'}</div>}</td><td><strong>{breakdown.ready?`${formatMoney(breakdown.referenceNetSalary)} ر.س`:'—'}</strong>{!breakdown.ready&&<div className="hint">{breakdown.reason}</div>}</td><td><input type="number" min="0.5" step="0.25" placeholder={inferred?String(inferred):'—'} value={line.day_hours_override??''} onChange={(e)=>setLineField(line.id,'day_hours_override',e.target.value)} style={{minWidth:85}}/></td><td><select value={line.payment_method||''} onChange={(e)=>setLineField(line.id,'payment_method',e.target.value||null)} style={{minWidth:140}}><option value="">{batch.default_payment_method?`افتراضي: ${PAYMENT_METHOD_LABEL[batch.default_payment_method]}`:'اختر'}</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td><button className="btn ghost" onClick={()=>openProfile(person.key)}>فتح</button></td></tr>;})}</tbody></table><div className="rowsplit" style={{marginTop:12}}><span className="hint">صافي الراتب يُحتسب تلقائيًا. الأجر الخاضع للاشتراك = الأساسي + بدل السكن.</span>{salaryMissingCount>0?<strong style={{color:'#8B2E2E'}}>متبقي {salaryMissingCount}</strong>:<strong>مكتمل</strong>}</div></div></div>

      <div className="section"><header><h2>سياسة الاحتساب</h2></header><div style={{padding:18}}><div className="form-grid"><div className="field"><label>قيمة اليوم</label><select value={batch.divisor_policy} onChange={(e)=>setBatchField('divisor_policy',e.target.value)}><option value="thirty">الراتب ÷ 30</option><option value="calendar_days">الراتب ÷ أيام الشهر</option></select></div><div className="field"><label>فرق الساعات</label><div style={{display:'flex',gap:16,alignItems:'center',minHeight:38,flexWrap:'wrap'}}><label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={batch.include_overtime!==false} onChange={(e)=>setBatchField('include_overtime',e.target.checked)}/> إضافي</label><label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={batch.include_time_shortage!==false} onChange={(e)=>setBatchField('include_time_shortage',e.target.checked)}/> نقص الساعات</label></div></div><div className="field"><label>البصمة المفقودة</label><div style={{display:'flex',alignItems:'center',gap:8}}><input type="number" min="0" step="0.25" value={batch.missing_punch_deduction_days} onChange={(e)=>setBatchField('missing_punch_deduction_days',e.target.value)}/><span className="hint">يوم / حالة مرفوضة</span></div></div><div className="field"><label>طريقة الدفع الافتراضية</label><select value={batch.default_payment_method||''} onChange={(e)=>setBatchField('default_payment_method',e.target.value||null)}><option value="">لكل موظف</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn ghost" disabled={busy||!dirty} onClick={()=>saveInputs(true)}>حفظ</button><button className="btn ghost" disabled={busy} onClick={()=>letterheadRef.current?.click()}>{batch.client_letterhead_path?'استبدال مطبوعات العميل':'رفع مطبوعات العميل'}</button><input ref={letterheadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={(e)=>uploadLetterhead(e.target.files?.[0])}/></div></div></div>

      <div className="section"><header><h2>احتساب المسير</h2></header><div style={{padding:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{salaryMissingCount===0?'جاهز للاحتساب':`أكمل بيانات ${salaryMissingCount} موظف`}</strong><button className="btn" disabled={busy||salaryMissingCount>0} onClick={calculateAll}>{busy?'جارٍ الاحتساب…':'احتساب الرواتب'}</button></div></div>

      {!dirty&&lines.some((line)=>line.calculated_at)&&<div className="section"><header><h2>مسير الرواتب</h2></header><div className="stat-grid" style={{padding:18}}><div className="stat"><span>صافي الراتب</span><strong>{formatMoney(totals.reference)} ر.س</strong></div><div className="stat"><span>الإضافات</span><strong>{formatMoney(totals.additions)} ر.س</strong></div><div className="stat"><span>الخصومات</span><strong>{formatMoney(totals.deductions)} ر.س</strong></div><div className="stat"><span>صافي المستحق</span><strong>{formatMoney(totals.final)} ر.س</strong></div></div><div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>الغياب</th><th>البصمات المفقودة</th>{showTimeDifference&&<th>فرق الساعات</th>}<th>الإضافات</th><th>الخصومات</th><th>صافي المستحق</th><th>القسيمة</th></tr></thead><tbody>{people.map((person)=>{const line=lineByKey.get(person.key);const profile=profileByKey.get(person.key);if(!line||!profile||!line.calculated_at)return null;const calc=calculateExternalPayroll({days:daysByKey.get(person.key)||[],line,batch,profile,periodFrom:activeImport?.period_from,periodTo:activeImport?.period_to});const open=expanded===person.key;return <tr key={person.key} style={{verticalAlign:'top'}}><td><strong>{profile.display_name}</strong><div className="hint">{profile.display_employee_no||person.no||'—'}</div></td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.absenceDays} يوم`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:190}}>{calc.absenceDates.length?calc.absenceDates.join('، '):'لا يوجد'}</div>}</td><td><button className="btn ghost" style={{padding:'6px 9px'}} onClick={()=>setExpanded(open?'':person.key)}>{calc.ready?`${calc.missingPunchDays} حالة`:'—'}</button>{open&&calc.ready&&<div className="hint" style={{marginTop:5,maxWidth:210}}>دخول {calc.missingInCount} · خروج {calc.missingOutCount}{calc.missingPunchDates.length?<><br/>{calc.missingPunchDates.map((item)=>`${item.date} ${item.kind==='missing_in'?'(دخول)':'(خروج)'}`).join('، ')}</>:null}</div>}</td>{showTimeDifference&&<td>{calc.ready?<strong>{formatMinutesSigned(calc.netMinutes)}</strong>:'—'}</td>}<td>{calc.ready?`${formatMoney(calc.totalAdditions)} ر.س`:'—'}</td><td>{calc.ready?`${formatMoney(calc.totalDeductions)} ر.س`:'—'}</td><td><strong>{calc.ready?`${formatMoney(calc.finalNetSalary)} ر.س`:'—'}</strong></td><td><Link className="btn" href={`/dashboard/attendance/payroll/${batch.id}/payslip/${line.id}`} target="_blank">قسيمة الراتب</Link></td></tr>;})}</tbody></table></div></div>}
    </>}

    {profileDraft&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.4)',display:'grid',placeItems:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy){setProfileDraft(null);setEditKey('');}}}><div className="section" style={{width:'min(800px,96vw)',maxHeight:'90vh',overflow:'auto',background:'#fff',margin:0}}><header><h2>بيانات الموظف</h2><button className="btn ghost" onClick={()=>{setProfileDraft(null);setEditKey('');}}>إغلاق</button></header><div style={{padding:18}}><div className="form-grid"><div className="field"><label>الاسم</label><input value={profileDraft.display_name||''} onChange={(e)=>setProfileDraft((current)=>({...current,display_name:e.target.value}))}/><span className="hint">المصدر: {profileDraft.source_employee_name||'—'}</span></div><div className="field"><label>الرقم الوظيفي</label><input value={profileDraft.display_employee_no||''} onChange={(e)=>setProfileDraft((current)=>({...current,display_employee_no:e.target.value}))}/></div><div className="field"><label>الجنسية</label><select value={profileDraft.nationality_category||''} onChange={(e)=>{const value=e.target.value;setProfileDraft((current)=>({...current,nationality_category:value,social_insurance_scheme:value==='saudi'?(['saudi_legacy','saudi_new'].includes(current.social_insurance_scheme)?current.social_insurance_scheme:'saudi_legacy'):value==='gcc'?'manual':null}));}}><option value="">اختر</option>{NATIONALITY_CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>التأمينات الاجتماعية</label><label style={{display:'flex',gap:8,alignItems:'center',minHeight:38}}><input type="checkbox" checked={!!profileDraft.social_insurance_active} onChange={(e)=>setProfileDraft((current)=>({...current,social_insurance_active:e.target.checked}))}/> مسجل في التأمينات</label>{profileDraft.social_insurance_active&&profileDraft.nationality_category==='saudi'&&<select value={profileDraft.social_insurance_scheme||'saudi_legacy'} onChange={(e)=>setProfileDraft((current)=>({...current,social_insurance_scheme:e.target.value}))}><option value="saudi_legacy">النظام القائم</option><option value="saudi_new">النظام الجديد</option></select>}{profileDraft.social_insurance_active&&profileDraft.nationality_category==='gcc'&&<input type="number" min="0" max="100" step="0.01" placeholder="نسبة الموظف %" value={profileDraft.gosi_employee_rate_override??''} onChange={(e)=>setProfileDraft((current)=>({...current,gosi_employee_rate_override:e.target.value}))}/>}</div><div className="field"><label>المسمى الوظيفي</label><input value={profileDraft.job_title||''} onChange={(e)=>setProfileDraft((current)=>({...current,job_title:e.target.value}))}/></div><div className="field"><label>الهوية / الإقامة</label><input value={profileDraft.identity_no||''} onChange={(e)=>setProfileDraft((current)=>({...current,identity_no:e.target.value}))}/></div><div className="field"><label>إضافة</label><input type="number" min="0" step="0.01" value={profileDraft.manual_additions??0} onChange={(e)=>setProfileDraft((current)=>({...current,manual_additions:e.target.value}))}/><input placeholder="السبب" style={{marginTop:7}} value={profileDraft.manual_additions_reason||''} onChange={(e)=>setProfileDraft((current)=>({...current,manual_additions_reason:e.target.value}))}/></div><div className="field"><label>خصم</label><input type="number" min="0" step="0.01" value={profileDraft.manual_deductions??0} onChange={(e)=>setProfileDraft((current)=>({...current,manual_deductions:e.target.value}))}/><input placeholder="السبب" style={{marginTop:7}} value={profileDraft.manual_deductions_reason||''} onChange={(e)=>setProfileDraft((current)=>({...current,manual_deductions_reason:e.target.value}))}/></div><div className="field"><label>طريقة الدفع</label><select value={profileDraft.default_payment_method||''} onChange={(e)=>setProfileDraft((current)=>({...current,default_payment_method:e.target.value||null}))}><option value="">بدون افتراضي</option>{PAYMENT_METHODS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><div style={{display:'flex',gap:16,marginTop:14,flexWrap:'wrap'}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_job_title} onChange={(e)=>setProfileDraft((current)=>({...current,show_job_title:e.target.checked}))}/> إظهار المسمى</label><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!profileDraft.show_identity} onChange={(e)=>setProfileDraft((current)=>({...current,show_identity:e.target.checked}))}/> إظهار الهوية / الإقامة</label></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="btn ghost" disabled={busy} onClick={()=>{setProfileDraft(null);setEditKey('');}}>إلغاء</button><button className="btn" disabled={busy} onClick={saveProfile}>{busy?'جارٍ الحفظ…':'حفظ'}</button></div></div></div></div>}
  </div>;
}
