'use client';

import { useEffect,useMemo,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import ProcedureSourceControl from '@/components/approval/ProcedureSourceControl';
import { TableFrame,EmptyState,Notice,SummaryStrip,EntrySurface,Toolbar } from '@/components/ui/ConstitutionUI';

const KIND={
  verbal_warning:'إنذار شفهي',written_warning:'إنذار كتابي',deduction:'خصم',suspension:'إيقاف',termination_notice:'إشعار إنهاء',
};
const STATUS={draft:'مسودة',submitted:'مرسل للاعتماد',hr_reviewed:'مراجع إداريًا',accountant_approved:'مراجع ماليًا',ceo_approved:'معتمد نهائيًا',rejected:'مرفوض',cancelled:'ملغى'};
const TERMINAL=new Set(['accountant_approved','ceo_approved','rejected','cancelled']);
const EDITABLE=new Set(['draft','rejected']);
const money=v=>`${Number(v||0).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const date=v=>v?new Date(v).toLocaleDateString('ar-SA'):'—';
const today=()=>new Date().toISOString().slice(0,10);
const EMPTY=()=>({employee_id:'',action_kind:'written_warning',violation_date:today(),description:'',deduction_amount:0,suspension_days:0,investigation_minutes:'',employee_response:''});

export default function DisciplinaryActionsTable(){
  const me=useDashboardSession();
  const canCreate=Boolean(me?.access?.fullAdmin)||me?.capabilityKeys?.has('hr.disciplinary.create');
  const canEdit=Boolean(me?.access?.fullAdmin)||me?.capabilityKeys?.has('hr.disciplinary.edit');
  const [rows,setRows]=useState(null),[employees,setEmployees]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(null),[editing,setEditing]=useState(null),[form,setForm]=useState(EMPTY()),[busy,setBusy]=useState(false);
  const names=useMemo(()=>new Map(employees.map(r=>[r.id,r.full_name_ar||'—'])),[employees]);

  async function load(){
    setError('');
    const [rowQ,empQ]=await Promise.all([
      supabase.from('disciplinary_actions').select('*').order('violation_date',{ascending:false}).limit(150),
      supabase.from('employees').select('id,employee_no,full_name_ar,status').in('status',['active','on_leave','suspended']).order('full_name_ar'),
    ]);
    if(rowQ.error||empQ.error){setError((rowQ.error||empQ.error).message);setRows(rowQ.data||[]);setEmployees(empQ.data||[]);return;}
    setRows(rowQ.data||[]);setEmployees(empQ.data||[]);
  }
  useEffect(()=>{load();},[]);

  const summary=useMemo(()=>{const list=rows||[];return[
    {key:'count',label:'الإجراءات',value:list.length,note:'المسجلة'},
    {key:'open',label:'قيد المتابعة',value:list.filter(r=>!TERMINAL.has(String(r.status||''))).length,note:'غير نهائية'},
    {key:'draft',label:'المسودات',value:list.filter(r=>String(r.status||'')==='draft').length,note:'لم تُرسل بعد'},
    {key:'deductions',label:'إجمالي الخصومات',value:money(list.reduce((s,r)=>s+Number(r.deduction_amount||0),0)),note:'حسب السجل الحالي'},
  ];},[rows]);

  function startNew(){setSelected(null);setEditing('new');setForm(EMPTY());setError('');setMessage('');}
  function startEdit(row){setSelected(null);setEditing(row.id);setForm({employee_id:row.employee_id||'',action_kind:row.action_kind||'written_warning',violation_date:row.violation_date||today(),description:row.description||'',deduction_amount:Number(row.deduction_amount||0),suspension_days:Number(row.suspension_days||0),investigation_minutes:row.investigation_minutes||'',employee_response:row.employee_response||''});setError('');setMessage('');}
  function closeEditor(){setEditing(null);setForm(EMPTY());}

  async function save(e){
    e.preventDefault();if(!form.employee_id||!form.description.trim()){setError('اختر الموظف واكتب وصف المخالفة.');return;}
    setBusy(true);setError('');setMessage('');
    const payload={
      employee_id:form.employee_id,action_kind:form.action_kind,violation_date:form.violation_date,description:form.description.trim(),
      deduction_amount:form.action_kind==='deduction'?Number(form.deduction_amount||0):0,
      suspension_days:form.action_kind==='suspension'?Number(form.suspension_days||0):0,
      investigation_minutes:form.investigation_minutes.trim()||null,employee_response:form.employee_response.trim()||null,
    };
    let result;
    if(editing==='new'){
      const noQ=await supabase.rpc('next_document_number',{p_doc_type:'DISCIPLINARY',p_prefix:'DSC'});
      if(noQ.error){setError(noQ.error.message);setBusy(false);return;}
      result=await supabase.from('disciplinary_actions').insert({...payload,action_no:noQ.data,status:'draft'});
    }else{
      result=await supabase.from('disciplinary_actions').update(payload).eq('id',editing).in('status',['draft','rejected']);
    }
    if(result.error){setError(result.error.message);setBusy(false);return;}
    setMessage(editing==='new'?'تم حفظ الإجراء كمسودة.':'تم تحديث المسودة.');closeEditor();await load();setBusy(false);
  }

  async function remove(row){
    if(!EDITABLE.has(String(row.status||''))||!confirm(`حذف الإجراء ${row.action_no||''}؟`))return;
    setBusy(true);setError('');const q=await supabase.from('disciplinary_actions').delete().eq('id',row.id).in('status',['draft','rejected']);
    if(q.error)setError(q.error.message);else{setSelected(null);setMessage('تم حذف المسودة.');await load();}setBusy(false);
  }

  if(rows===null)return <EmptyState title="جارٍ تحميل الإجراءات التأديبية" description="نقرأ السجل والموظفين من المصدر مباشرة."/>;
  const selectedName=selected?names.get(selected.employee_id)||'—':'—';

  return <>
    {error?<Notice tone="error">{error}</Notice>:null}{message?<Notice tone="success">{message}</Notice>:null}
    <div className="rowsplit" style={{marginBottom:12}}><SummaryStrip items={summary}/></div>
    {canCreate&&!editing?<Toolbar><button className="btn" type="button" onClick={startNew}>+ إجراء تأديبي</button></Toolbar>:null}

    {editing?<EntrySurface title={editing==='new'?'إجراء تأديبي جديد':'تعديل مسودة الإجراء'} description="هذه الخطوة توثق الواقعة فقط. إرسالها للاعتماد يتم بعد الحفظ من داخل المعاملة.">
      <form onSubmit={save} style={{padding:22}}>
        <div className="form-grid">
          <div className="field span2"><label>الموظف *</label><select required value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">اختر الموظف</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no||''} — {e.full_name_ar}</option>)}</select></div>
          <div className="field"><label>نوع الإجراء *</label><select value={form.action_kind} onChange={e=>setForm({...form,action_kind:e.target.value})}>{Object.entries(KIND).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>تاريخ المخالفة *</label><input type="date" required value={form.violation_date} onChange={e=>setForm({...form,violation_date:e.target.value})}/></div>
          {form.action_kind==='deduction'?<div className="field"><label>مبلغ الخصم</label><input type="number" min="0" step="0.01" value={form.deduction_amount} onChange={e=>setForm({...form,deduction_amount:e.target.value})}/></div>:null}
          {form.action_kind==='suspension'?<div className="field"><label>أيام الإيقاف</label><input type="number" min="0" step="1" value={form.suspension_days} onChange={e=>setForm({...form,suspension_days:e.target.value})}/></div>:null}
          <div className="field span3"><label>وصف المخالفة *</label><textarea rows="3" required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div className="field span3"><label>محضر التحقيق / الوقائع</label><textarea rows="3" value={form.investigation_minutes} onChange={e=>setForm({...form,investigation_minutes:e.target.value})}/></div>
          <div className="field span3"><label>رد الموظف</label><textarea rows="3" value={form.employee_response} onChange={e=>setForm({...form,employee_response:e.target.value})}/></div>
        </div>
        <Toolbar><button className="btn" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ المسودة'}</button><button className="btn ghost" type="button" disabled={busy} onClick={closeEditor}>إلغاء</button></Toolbar>
      </form>
    </EntrySurface>:null}

    {selected?<EntrySurface title={`إجراء ${selected.action_no||''} — ${selectedName}`} description="أنت في جهة المنشأ — الموارد البشرية">
      <div style={{padding:22,display:'grid',gap:16}}>
        <div className="form-grid">
          <div className="field"><label>نوع الإجراء</label><strong>{KIND[selected.action_kind]||selected.action_kind||'—'}</strong></div>
          <div className="field"><label>تاريخ المخالفة</label><strong>{date(selected.violation_date)}</strong></div>
          <div className="field"><label>الحالة</label><strong>{STATUS[selected.status]||selected.status||'—'}</strong></div>
          <div className="field"><label>الخصم</label><strong>{money(selected.deduction_amount)}</strong></div>
          <div className="field span2"><label>الوصف</label><div>{selected.description||'—'}</div></div>
          {selected.investigation_minutes?<div className="field span2"><label>محضر التحقيق</label><div>{selected.investigation_minutes}</div></div>:null}
          {selected.employee_response?<div className="field span2"><label>رد الموظف</label><div>{selected.employee_response}</div></div>:null}
        </div>
        <ProcedureSourceControl capabilityKey="hr.disciplinary.create" sourceTable="disciplinary_actions" sourceId={selected.id} sourceLabel={`إجراء موظف — ${selectedName}`} amount={Number(selected.deduction_amount||0)} currentDestinationKey="workforce"/>
        <Toolbar>
          {canEdit&&EDITABLE.has(String(selected.status||''))?<button className="btn ghost" type="button" onClick={()=>startEdit(selected)}>تعديل المسودة</button>:null}
          {canEdit&&EDITABLE.has(String(selected.status||''))?<button className="btn ghost" type="button" onClick={()=>remove(selected)} disabled={busy}>حذف المسودة</button>:null}
          <button className="btn ghost" type="button" onClick={()=>setSelected(null)}>إغلاق</button>
        </Toolbar>
      </div>
    </EntrySurface>:null}

    <Notice>السجل يعرض كل الإجراءات. إنشاء الواقعة وتعديل المسودة يتم هنا؛ قرار الاعتماد النهائي لا يُتخذ من صف الجدول.</Notice>
    {!rows.length?<EmptyState title="لا توجد إجراءات مسجلة" description="استخدم «إجراء تأديبي» لإنشاء أول مسودة."></EmptyState>:<TableFrame><table>
      <thead><tr><th>الرقم</th><th>الموظف</th><th>الإجراء</th><th>تاريخ المخالفة</th><th>الخصم</th><th>الحالة</th><th>الإجراء</th></tr></thead>
      <tbody>{rows.map(row=>{const name=names.get(row.employee_id)||'—';return <tr key={row.id}>
        <td>{row.action_no||'—'}</td><td>{name}</td><td>{KIND[row.action_kind]||row.action_kind||'—'}</td><td>{date(row.violation_date)}</td><td>{money(row.deduction_amount)}</td><td>{STATUS[row.status]||row.status||'—'}</td>
        <td><button className="btn ghost" type="button" onClick={()=>{setEditing(null);setSelected(row);}}>فتح</button></td>
      </tr>;})}</tbody>
    </table></TableFrame>}
  </>;
}
