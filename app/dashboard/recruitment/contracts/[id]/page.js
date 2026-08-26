'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { publicAppUrl } from '@/lib/public-url';

const S={internal_review:'مراجعة داخلية',internal_approved:'معتمد داخلياً',sent:'أُرسل للمرشح',candidate_changes:'أعاد المرشح ملاحظات',accepted:'مقبول',declined:'مرفوض',superseded:'مستبدل'};

function defaultText(d){
  const x=d?.contract_data||{};
  const salary=x.gross_salary!=null?`${money(x.gross_salary)} ريال شهرياً`:'وفق العرض الوظيفي المعتمد';
  return `مسودة عقد عمل للمراجعة الداخلية\n\nالطرف الأول: مؤسسة أركان المكان للمقاولات.\nالطرف الثاني: ${x.candidate_name||'—'}، رقم الهوية/الإقامة: ${x.candidate_id||'—'}.\n\nالمسمى الوظيفي: ${x.job_title||'—'}\nالإدارة: ${x.department||'—'}\nالأجر: ${salary}\nساعات العمل الفعلية: ${x.daily_work_hours||8} ساعات يومياً وفق تنظيم العمل المعتمد والأنظمة المعمول بها.\nفترة التجربة: ${x.probation_days??90} يوم، وتخضع لأي تمديد أو تعديل للأنظمة والموافقات اللازمة.\nالإجازة السنوية: ${x.annual_leave_days??'وفق السياسة والعقد'} يوم.\nتاريخ المباشرة المتوقع: ${dateAr(x.expected_start_date)}.\n\nتخضع هذه المسودة للمراجعة الداخلية ولا تعد بديلاً عن توثيق عقد العمل عبر المنصات الرسمية المعتمدة.`;
}

export default function ContractEditor(){
  const {id}=useParams();
  const [d,setD]=useState(null),[employees,setEmployees]=useState([]),[approver,setApprover]=useState(''),[text,setText]=useState(''),[code,setCode]=useState(''),[err,setErr]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const [a,e]=await Promise.all([
    supabase.from('employment_contract_drafts').select('*,job_offers(*),candidate_applications(candidates(full_name_ar,mobile,email),job_vacancies(title_ar,department))').eq('id',id).maybeSingle(),
    supabase.from('employees').select('id,full_name_ar,job_title,board_role').eq('status','active').order('full_name_ar')
  ]);if(a.error||e.error)setErr(a.error?.message||e.error?.message);setD(a.data);setEmployees(e.data||[]);if(a.data){setApprover(a.data.internal_approved_by_employee_id||'');setText(a.data.contract_text||defaultText(a.data));}},[id]);
  useEffect(()=>{load();},[load]);
  const flash=m=>{setSaved(m);setTimeout(()=>setSaved(''),1700)};
  async function saveText(){const {error}=await supabase.from('employment_contract_drafts').update({contract_text:text,updated_at:new Date().toISOString()}).eq('id',id);if(error)setErr(error.message);else flash('حُفظت المسودة');}
  async function approve(){if(!approver){setErr('اختر صاحب الاعتماد الفعلي');return;}setBusy(true);const {error}=await supabase.rpc('approve_contract_draft_internal',{p_draft:id,p_approver_employee:approver,p_contract_text:text,p_company_signature:true,p_company_stamp:true});setBusy(false);if(error){setErr(error.message);return;}flash('تم تسجيل الاعتماد الداخلي');load();}
  async function prepare(){setBusy(true);const {data,error}=await supabase.rpc('prepare_contract_verification',{p_draft:id,p_channel:'whatsapp'});setBusy(false);if(error){setErr(error.message);return;}setCode(data);flash('أُنشئ رمز التحقق');load();}
  async function copy(v,m){await navigator.clipboard.writeText(v);flash(m);}
  if(!d)return <div className="empty">جارٍ تحميل مسودة العقد…</div>;
  const editable=['internal_review','candidate_changes'].includes(d.status);
  const link=publicAppUrl(`/contracts/${d.public_token}`,typeof window!=='undefined'?window.location.origin:'');
  return <><div className="page-head"><div><h1>مسودة عقد العمل</h1><p>{d.job_offers?.candidate_name_snapshot} — النسخة {d.draft_version} — {S[d.status]||d.status}</p></div><div className="rowsplit"><Link className="btn ghost" href="/dashboard/recruitment/contracts">مسودات العقود</Link><Link className="btn ghost" href={`/dashboard/recruitment/applications/${d.application_id}`}>ملف المرشح</Link></div></div>
  {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}{saved&&<div className="msg ok" style={{marginBottom:12}}>{saved}</div>}
  {d.status==='candidate_changes'&&<div className="msg" style={{marginBottom:12,lineHeight:1.8}}><strong>ملاحظات المرشح:</strong> {d.candidate_comment||'لم يكتب تفاصيل.'}</div>}
  <div className="section" style={{marginTop:0,padding:18}}><header style={{margin:'-18px -18px 16px'}}><h2>نص المسودة</h2></header><textarea rows="24" style={{width:'100%',lineHeight:1.9,resize:'vertical'}} disabled={!editable} value={text} onChange={e=>setText(e.target.value)}/>{editable&&<button className="btn ghost" style={{marginTop:10}} onClick={saveText}>حفظ المسودة</button>}</div>
  {editable&&<div className="section"><header><h2>المراجعة والاعتماد الداخلي</h2></header><div style={{padding:18}}><div className="form-grid"><div className="field span2"><label>صاحب الاعتماد الفعلي *</label><select value={approver} onChange={e=>setApprover(e.target.value)}><option value="">اختر…</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name_ar}{e.board_role?` — ${e.board_role}`:e.job_title?` — ${e.job_title}`:''}</option>)}</select></div></div><p className="hint" style={{lineHeight:1.8}}>بعد تسجيل الاعتماد، يعكس النظام ختم وتوقيع المنشأة على النسخة المرسلة وفق الاعتماد الحقيقي المسجل.</p><button className="btn" onClick={approve} disabled={busy}>{busy?'جارٍ الاعتماد…':'تسجيل الاعتماد الداخلي'}</button></div></div>}
  {['internal_approved','sent'].includes(d.status)&&<div className="section"><header><h2>إرسال المسودة للمرشح</h2></header><div style={{padding:18}}><div className="field"><label>رابط المسودة</label><div className="rowsplit"><input readOnly dir="ltr" value={link}/><button className="btn ghost" onClick={()=>copy(link,'تم نسخ الرابط')}>نسخ</button></div></div><p className="hint" style={{marginTop:10,lineHeight:1.8}}>المرشح يستطيع: الموافقة والتوقيع، أو إعادة المسودة بملاحظاته للتعديل، أو الاعتذار. رمز التحقق صالح لمدة ساعة.</p><button className="btn" onClick={prepare} disabled={busy}>{busy?'جارٍ الإنشاء…':'إنشاء رمز تحقق من 8 أرقام'}</button>{code&&<div className="msg ok" style={{marginTop:12,fontSize:22,fontWeight:700,direction:'ltr',textAlign:'center'}}>{code}<button className="btn ghost" style={{marginLeft:12}} onClick={()=>copy(code,'تم نسخ الرمز')}>نسخ</button></div>}</div></div>}
  {d.status==='accepted'&&<div className="msg ok" style={{lineHeight:1.8}}>وافق المرشح على مسودة العقد بتاريخ {dateAr(d.candidate_accepted_at)}، وبدأ النظام تلقائياً ملف التهيئة وما قبل المباشرة.</div>}
  </>;
}