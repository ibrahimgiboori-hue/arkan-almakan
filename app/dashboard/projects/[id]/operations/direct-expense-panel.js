'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './operations.module.css';

const CATEGORIES = ['وجبات','أجور','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','وقود ومحروقات','تأمين مسترد','تأمين طبي','ضيافة','أخرى'];
const PAYER_AR = { contractor:'المقاول', arkan_direct:'أركان مباشرة', employee:'موظف من ماله الخاص' };
const CHARGE_AR = { arkan:'أركان', contractor:'المقاول', owner:'المالك' };
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits:2 });
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function freshRow(date, seed={}) {
  return {
    _id:uid(), expense_date:date, amount:'', notes:'', category:'مواد', payer:'contractor',
    charge_to:'arkan', project_item_id:'', paid_by_employee_id:'', is_recoverable:false, ...seed,
  };
}

export default function DirectExpensePanel({ projectId, date, contractor }){
  const [items,setItems] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [rows,setRows] = useState([]);
  const [entryRows,setEntryRows] = useState(()=>Array.from({length:6},()=>freshRow(date)));
  const [editingId,setEditingId] = useState('');
  const [edit,setEdit] = useState(freshRow(date));
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);

  useEffect(()=>{
    if(!editingId) setEntryRows(prev=>prev.map(r=>({...r,expense_date:r.amount||r.notes?r.expense_date:date})));
  },[date,editingId]);

  const load = useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);setFeedback(null);
    try{
      const [itemsQ,rowsQ,employeesQ]=await Promise.all([
        supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
        supabase.from('contractor_expenses').select('id,expense_date,category,amount,notes,is_recoverable,payer,charge_to,project_item_id,paid_by_employee_id,reimbursement_status,reimbursed_amount').eq('project_id',projectId).eq('contractor_id',contractor.id).eq('expense_date',date).neq('payer','arkan_custody').order('created_at'),
        supabase.from('employees').select('id,full_name_ar,status').eq('status','active').order('full_name_ar'),
      ]);
      const error=[itemsQ,rowsQ,employeesQ].find(x=>x.error)?.error;if(error)throw error;
      setItems(itemsQ.data||[]);setRows(rowsQ.data||[]);setEmployees(employeesQ.data||[]);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل المصروفات: '+(e.message||e)});}
    setLoading(false);
  },[projectId,date,contractor?.id]);
  useEffect(()=>{load()},[load]);

  const employeeName = useCallback((id)=>employees.find(e=>e.id===id)?.full_name_ar||'الموظف',[employees]);
  const total=rows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const employeeDue=rows.reduce((sum,row)=>sum+(row.paid_by_employee_id?Math.max(0,Number(row.amount||0)-Number(row.reimbursed_amount||0)):0),0);
  const validEntryRows=useMemo(()=>entryRows.filter(r=>Number(r.amount)>0&&r.notes.trim()),[entryRows]);
  const entryTotal=validEntryRows.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const reportHref = projectId&&contractor?.id ? `/print/expenses?project=${encodeURIComponent(projectId)}&contractor=${encodeURIComponent(contractor.id)}&from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}` : '#';

  function patchEntry(id,patch){setEntryRows(prev=>prev.map(r=>r._id===id?{...r,...patch}:r));}
  function addRows(count=4){setEntryRows(prev=>[...prev,...Array.from({length:count},()=>freshRow(date))]);}
  function duplicatePrevious(){
    setEntryRows(prev=>{
      const last=[...prev].reverse().find(r=>r.amount||r.notes) || prev[prev.length-1];
      return [...prev,freshRow(date,last?{expense_date:last.expense_date,category:last.category,payer:last.payer,charge_to:last.charge_to,project_item_id:last.project_item_id,paid_by_employee_id:last.paid_by_employee_id}:{})];
    });
  }
  function clearGrid(){setEntryRows(Array.from({length:6},()=>freshRow(date)));}

  async function saveBulk(){
    if(!validEntryRows.length){setFeedback({type:'error',text:'أدخل مبلغًا وبيانًا في صف واحد على الأقل.'});return;}
    const missingEmployee=validEntryRows.find(r=>r.payer==='employee'&&!r.paid_by_employee_id);
    if(missingEmployee){setFeedback({type:'error',text:'اختر الموظف الدافع في كل صف تم دفعه من مال موظف.'});return;}
    setBusy(true);setFeedback(null);
    try{
      const payload=validEntryRows.map(r=>({
        expense_date:r.expense_date||date,amount:Number(r.amount),notes:r.notes.trim(),category:r.category,
        payer:r.payer,charge_to:r.charge_to,project_item_id:r.project_item_id||null,
        paid_by_employee_id:r.payer==='employee'?(r.paid_by_employee_id||null):null,is_recoverable:false,
      }));
      const {error}=await supabase.rpc('fn_bulk_save_project_expenses',{p_project_id:projectId,p_contractor_id:contractor.id,p_rows:payload});
      if(error)throw error;
      setFeedback({type:'success',text:`تم حفظ ${payload.length} مصروفات بإجمالي ${money(entryTotal)} ر.س دفعة واحدة.`});
      clearGrid();await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ المصروفات: '+(e.message||e)});}
    setBusy(false);
  }

  function startEdit(row){
    setEditingId(row.id);
    setEdit(freshRow(row.expense_date||date,{
      expense_date:row.expense_date||date,amount:String(row.amount??''),notes:row.notes||'',category:row.category||'أخرى',
      payer:row.paid_by_employee_id?'employee':(row.payer||'contractor'),charge_to:row.charge_to||'arkan',
      project_item_id:row.project_item_id||'',paid_by_employee_id:row.paid_by_employee_id||'',is_recoverable:!!row.is_recoverable,
    }));
    setFeedback(null);
  }
  function cancelEdit(){setEditingId('');setEdit(freshRow(date));}

  async function saveEdit(e){
    e.preventDefault();
    if(!Number(edit.amount)||!edit.notes.trim())return;
    if(edit.payer==='employee'&&!edit.paid_by_employee_id){setFeedback({type:'error',text:'اختر الموظف الذي دفع من ماله الخاص.'});return;}
    setBusy(true);setFeedback(null);
    try{
      const patch={
        expense_date:edit.expense_date,amount:Number(edit.amount),category:edit.category,notes:edit.notes.trim(),
        payer:edit.payer,charge_to:edit.charge_to,project_item_id:edit.project_item_id||null,
        paid_by_employee_id:edit.payer==='employee'?(edit.paid_by_employee_id||null):null,is_recoverable:false,
      };
      const {error}=await supabase.from('contractor_expenses').update(patch).eq('id',editingId).eq('project_id',projectId).select('id').single();
      if(error)throw error;
      setFeedback({type:'success',text:edit.payer==='employee'?`تم التصحيح. أصبح المبلغ مستحقًا لـ ${employeeName(edit.paid_by_employee_id)} دون إنشاء مصروف إضافي.`:'تم تعديل المصروف بنجاح.'});
      cancelEdit();await load();
    }catch(e){setFeedback({type:'error',text:'تعذر تعديل المصروف: '+(e.message||e)});}
    setBusy(false);
  }

  const cellStyle={padding:5,border:'1px solid rgba(148,163,184,.22)',verticalAlign:'middle'};
  const inputStyle={width:'100%',minWidth:0,padding:'8px 7px',borderRadius:7,border:'1px solid rgba(148,163,184,.28)',background:'transparent',color:'inherit'};

  return <section className={styles.operationGrid}>
    <main className={styles.formPane} style={{minWidth:0}}>
      <div className={styles.panelTitle}>
        <div><span>EXPENSES · RAPID ENTRY</span><h2>{editingId?'تعديل المصروف':'إدخال المصروفات السريع'}</h2><p>{editingId?'صحح الحركة نفسها؛ لا تحذفها ولا تنشئ حركة بديلة.':'أدخل عدة مصروفات كجدول ثم احفظها كلها مرة واحدة. البند اختياري، ويمكن تسجيل ما دفعه الموظف من ماله كمستحق له تلقائيًا.'}</p></div>
        <div style={{display:'grid',gap:8,justifyItems:'end'}}><strong>{money(total)} <small>ر.س</small></strong><a href={reportHref} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:800,textDecoration:'none'}}>تقرير المصروفات / طباعة</a></div>
      </div>
      {feedback&&<div className={feedback.type==='error'?styles.panelError:styles.panelSuccess}>{feedback.text}</div>}

      {editingId ? <form className={styles.operationForm} onSubmit={saveEdit}>
        <label><span>التاريخ</span><input type="date" required value={edit.expense_date} onChange={e=>setEdit(f=>({...f,expense_date:e.target.value}))}/></label>
        <label><span>المبلغ</span><input type="number" min="0.01" step="0.01" required value={edit.amount} onChange={e=>setEdit(f=>({...f,amount:e.target.value}))}/></label>
        <label><span>التصنيف</span><select value={edit.category} onChange={e=>setEdit(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className={styles.wideField}><span>البيان</span><input required value={edit.notes} onChange={e=>setEdit(f=>({...f,notes:e.target.value}))}/></label>
        <label><span>من دفع؟</span><select value={edit.payer} onChange={e=>setEdit(f=>({...f,payer:e.target.value,paid_by_employee_id:e.target.value==='employee'?f.paid_by_employee_id:''}))}>{Object.entries(PAYER_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        {edit.payer==='employee'&&<label><span>الموظف الدافع</span><select required value={edit.paid_by_employee_id} onChange={e=>setEdit(f=>({...f,paid_by_employee_id:e.target.value}))}><option value="">اختر الموظف</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name_ar}</option>)}</select></label>}
        <label><span>على من؟</span><select value={edit.charge_to} onChange={e=>setEdit(f=>({...f,charge_to:e.target.value}))}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label><span>البند</span><select value={edit.project_item_id} onChange={e=>setEdit(f=>({...f,project_item_id:e.target.value}))}><option value="">مصروف عام — بدون بند</option>{items.map(i=><option key={i.id} value={i.id}>{i.description_ar}</option>)}</select></label>
        <button className={styles.primaryAction} disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ التعديل'}</button><button type="button" onClick={cancelEdit} disabled={busy}>إلغاء</button>
      </form> : loading ? <div className={styles.panelEmpty}>جارٍ تحميل بيانات المصروفات…</div> : <>
        <div style={{overflowX:'auto',marginTop:12,borderRadius:12,border:'1px solid rgba(148,163,184,.18)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1120,fontSize:12}}>
            <thead><tr><th style={cellStyle}>#</th><th style={cellStyle}>التاريخ</th><th style={cellStyle}>المبلغ</th><th style={cellStyle}>التصنيف</th><th style={{...cellStyle,minWidth:230}}>البيان</th><th style={cellStyle}>من دفع؟</th><th style={cellStyle}>الموظف</th><th style={cellStyle}>على من؟</th><th style={{...cellStyle,minWidth:180}}>البند</th><th style={cellStyle}>×</th></tr></thead>
            <tbody>{entryRows.map((r,index)=><tr key={r._id}>
              <td style={{...cellStyle,textAlign:'center'}}>{index+1}</td>
              <td style={cellStyle}><input style={inputStyle} type="date" value={r.expense_date} onChange={e=>patchEntry(r._id,{expense_date:e.target.value})}/></td>
              <td style={cellStyle}><input style={inputStyle} type="number" min="0" step="0.01" value={r.amount} onChange={e=>patchEntry(r._id,{amount:e.target.value})}/></td>
              <td style={cellStyle}><select style={inputStyle} value={r.category} onChange={e=>patchEntry(r._id,{category:e.target.value})}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></td>
              <td style={cellStyle}><input style={inputStyle} value={r.notes} placeholder="اكتب البيان ثم Enter للصف التالي" onChange={e=>patchEntry(r._id,{notes:e.target.value})}/></td>
              <td style={cellStyle}><select style={inputStyle} value={r.payer} onChange={e=>patchEntry(r._id,{payer:e.target.value,paid_by_employee_id:e.target.value==='employee'?r.paid_by_employee_id:''})}>{Object.entries(PAYER_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
              <td style={cellStyle}>{r.payer==='employee'?<select style={inputStyle} value={r.paid_by_employee_id} onChange={e=>patchEntry(r._id,{paid_by_employee_id:e.target.value})}><option value="">اختر</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name_ar}</option>)}</select>:<span style={{opacity:.45}}>—</span>}</td>
              <td style={cellStyle}><select style={inputStyle} value={r.charge_to} onChange={e=>patchEntry(r._id,{charge_to:e.target.value})}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
              <td style={cellStyle}><select style={inputStyle} value={r.project_item_id} onChange={e=>patchEntry(r._id,{project_item_id:e.target.value})}><option value="">عام</option>{items.map(i=><option key={i.id} value={i.id}>{i.description_ar}</option>)}</select></td>
              <td style={{...cellStyle,textAlign:'center'}}><button type="button" onClick={()=>setEntryRows(prev=>prev.length>1?prev.filter(x=>x._id!==r._id):prev)} aria-label="حذف الصف">×</button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginTop:12}}>
          <button type="button" onClick={()=>addRows(4)}>+ 4 صفوف</button><button type="button" onClick={duplicatePrevious}>نسخ إعدادات آخر صف</button><button type="button" onClick={clearGrid}>تفريغ الجدول</button>
          <span style={{marginInlineStart:'auto',fontWeight:800}}>جاهز للحفظ: {validEntryRows.length} · {money(entryTotal)} ر.س</span>
          <button className={styles.primaryAction} type="button" onClick={saveBulk} disabled={busy||!validEntryRows.length}>{busy?'جارٍ الحفظ…':`حفظ ${validEntryRows.length||''} مصروفات`}</button>
        </div>
      </>}
    </main>

    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>مصروف اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{money(total)} ر.س</b></div>
      {employeeDue>0&&<div style={{padding:'10px 12px',margin:'8px 0',borderRadius:10,border:'1px solid rgba(245,158,11,.35)'}}><strong>مستحقات موظفين من مصروفات اليوم</strong><div style={{fontSize:18,fontWeight:900,marginTop:4}}>{money(employeeDue)} ر.س</div><small>هذه ليست مصروفات إضافية؛ هي مبالغ سددها موظفون من مالهم وتستحق لهم.</small></div>}
      <div className={styles.activityList}>{rows.length?rows.map(row=><div className={styles.activityRow} key={row.id}><div><strong>{row.category}</strong><small>{row.notes||'—'} · {row.project_item_id?'مرتبط ببند':'مصروف عام'}{row.paid_by_employee_id?` · دفعه ${employeeName(row.paid_by_employee_id)} · مستحق له ${money(Number(row.amount)-Number(row.reimbursed_amount||0))} ر.س`:''}</small><button type="button" onClick={()=>startEdit(row)} disabled={busy}>تعديل</button></div><b>{money(row.amount)} ر.س</b></div>):<div className={styles.panelEmpty}>لا توجد مصروفات مباشرة لهذا المقاول اليوم.</div>}</div>
    </aside>
  </section>;
}
