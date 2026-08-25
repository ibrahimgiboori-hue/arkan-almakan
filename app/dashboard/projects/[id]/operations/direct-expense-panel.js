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
    _id:uid(), id:null, persisted:false, expense_date:date, amount:'', notes:'', category:'مواد', payer:'contractor',
    charge_to:'arkan', project_item_id:'', paid_by_employee_id:'', is_recoverable:false,
    reimbursement_status:null, reimbursed_amount:0, ...seed,
  };
}

function dbRowToGrid(row, date) {
  return freshRow(row.expense_date || date, {
    id:row.id,
    persisted:true,
    expense_date:row.expense_date || date,
    amount:String(row.amount ?? ''),
    notes:row.notes || '',
    category:row.category || 'أخرى',
    payer:row.paid_by_employee_id ? 'employee' : (row.payer || 'contractor'),
    charge_to:row.charge_to || 'arkan',
    project_item_id:row.project_item_id || '',
    paid_by_employee_id:row.paid_by_employee_id || '',
    is_recoverable:!!row.is_recoverable,
    reimbursement_status:row.reimbursement_status || null,
    reimbursed_amount:Number(row.reimbursed_amount || 0),
  });
}

function rowPayload(row, fallbackDate) {
  return {
    expense_date:row.expense_date || fallbackDate,
    amount:Number(row.amount),
    notes:row.notes.trim(),
    category:row.category,
    payer:row.payer,
    charge_to:row.charge_to,
    project_item_id:row.project_item_id || null,
    paid_by_employee_id:row.payer === 'employee' ? (row.paid_by_employee_id || null) : null,
    is_recoverable:false,
  };
}

export default function DirectExpensePanel({ projectId, date, contractor }){
  const [items,setItems] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [entryRows,setEntryRows] = useState(()=>Array.from({length:6},()=>freshRow(date)));
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);

  const load = useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);setFeedback(null);
    try{
      const [itemsQ,rowsQ,employeesQ]=await Promise.all([
        supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
        supabase.from('contractor_expenses')
          .select('id,expense_date,category,amount,notes,is_recoverable,payer,charge_to,project_item_id,paid_by_employee_id,reimbursement_status,reimbursed_amount,created_at')
          .eq('project_id',projectId).eq('contractor_id',contractor.id).eq('expense_date',date)
          .neq('payer','arkan_custody').order('created_at'),
        supabase.from('employees').select('id,full_name_ar,status').eq('status','active').order('full_name_ar'),
      ]);
      const error=[itemsQ,rowsQ,employeesQ].find(x=>x.error)?.error;if(error)throw error;
      const saved=(rowsQ.data||[]).map(row=>dbRowToGrid(row,date));
      const blanks=Array.from({length:Math.max(4,6-saved.length)},()=>freshRow(date));
      setItems(itemsQ.data||[]);
      setEmployees(employeesQ.data||[]);
      setEntryRows([...saved,...blanks]);
    }catch(e){
      setFeedback({type:'error',text:'تعذر تحميل مصروفات هذا اليوم: '+(e.message||e)});
      setEntryRows(Array.from({length:6},()=>freshRow(date)));
    }
    setLoading(false);
  },[projectId,date,contractor?.id]);

  useEffect(()=>{load()},[load]);

  const savedRows=useMemo(()=>entryRows.filter(r=>r.persisted),[entryRows]);
  const validRows=useMemo(()=>entryRows.filter(r=>Number(r.amount)>0&&r.notes.trim()),[entryRows]);
  const newRows=useMemo(()=>validRows.filter(r=>!r.persisted),[validRows]);
  const savedTotal=useMemo(()=>savedRows.reduce((sum,r)=>sum+Number(r.amount||0),0),[savedRows]);
  const currentGridTotal=useMemo(()=>validRows.reduce((sum,r)=>sum+Number(r.amount||0),0),[validRows]);
  const employeeDue=useMemo(()=>savedRows.reduce((sum,r)=>sum+(r.paid_by_employee_id?Math.max(0,Number(r.amount||0)-Number(r.reimbursed_amount||0)):0),0),[savedRows]);

  function patchEntry(rowKey,patch){
    setEntryRows(prev=>prev.map(r=>r._id===rowKey?{...r,...patch}:r));
  }

  function addRows(count=4){
    setEntryRows(prev=>[...prev,...Array.from({length:count},()=>freshRow(date))]);
  }

  function duplicatePrevious(){
    setEntryRows(prev=>{
      const last=[...prev].reverse().find(r=>r.amount||r.notes) || prev[prev.length-1];
      const seed=last?{
        expense_date:last.expense_date||date,
        category:last.category,
        payer:last.payer,
        charge_to:last.charge_to,
        project_item_id:last.project_item_id,
        paid_by_employee_id:last.paid_by_employee_id,
      }:{};
      return [...prev,freshRow(date,seed)];
    });
  }

  async function removeRow(row){
    if(!row.persisted){
      setEntryRows(prev=>prev.length>1?prev.filter(r=>r._id!==row._id):[freshRow(date)]);
      return;
    }
    if(!window.confirm(`حذف المصروف ${money(row.amount)} ر.س من هذا اليوم؟`))return;
    setBusy(true);setFeedback(null);
    try{
      const {error}=await supabase.from('contractor_expenses').delete().eq('id',row.id).eq('project_id',projectId);
      if(error)throw error;
      setFeedback({type:'success',text:'تم حذف المصروف من اليوم وتحديث بيانات المشروع.'});
      await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حذف المصروف: '+(e.message||e)});}
    setBusy(false);
  }

  async function saveGrid(){
    if(!validRows.length){setFeedback({type:'error',text:'لا توجد بيانات جاهزة للحفظ.'});return;}
    const incomplete=entryRows.find(r=>(Number(r.amount)>0||r.notes.trim())&&!(Number(r.amount)>0&&r.notes.trim()));
    if(incomplete){setFeedback({type:'error',text:'كل صف مستخدم يحتاج مبلغًا وبيانًا معًا.'});return;}
    const missingEmployee=validRows.find(r=>r.payer==='employee'&&!r.paid_by_employee_id);
    if(missingEmployee){setFeedback({type:'error',text:'اختر الموظف الدافع في كل صف تم دفعه من ماله الخاص.'});return;}
    setBusy(true);setFeedback(null);
    try{
      const persisted=validRows.filter(r=>r.persisted);
      for(const row of persisted){
        const {error}=await supabase.from('contractor_expenses')
          .update(rowPayload(row,date))
          .eq('id',row.id).eq('project_id',projectId);
        if(error)throw error;
      }
      if(newRows.length){
        const {error}=await supabase.rpc('fn_bulk_save_project_expenses',{
          p_project_id:projectId,
          p_contractor_id:contractor.id,
          p_rows:newRows.map(row=>rowPayload(row,date)),
        });
        if(error)throw error;
      }
      setFeedback({type:'success',text:`تم حفظ الجدول: ${persisted.length} حركة محدثة و${newRows.length} حركة جديدة. إجمالي الجدول ${money(currentGridTotal)} ر.س.`});
      await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ جدول المصروفات: '+(e.message||e)});}
    setBusy(false);
  }

  const cellStyle={padding:5,border:'1px solid rgba(148,163,184,.22)',verticalAlign:'middle'};
  const inputStyle={width:'100%',minWidth:0,padding:'8px 7px',borderRadius:7,border:'1px solid rgba(148,163,184,.28)',background:'transparent',color:'inherit'};
  const savedInputStyle={...inputStyle,background:'rgba(111,37,43,.045)',border:'1px solid rgba(111,37,43,.20)'};

  return <section style={{width:'100%',minWidth:0,borderTop:'1px solid rgba(148,163,184,.22)'}}>
    <main className={styles.formPane} style={{width:'100%',minWidth:0,paddingInline:0}}>
      <div className={styles.panelTitle}>
        <div>
          <span>EXPENSES · DAILY GRID</span>
          <h2>مصروفات اليوم — إدخال ومراجعة مباشرة</h2>
          <p>المصروفات المحفوظة لهذا التاريخ تظهر داخل الجدول نفسه. عدّلها مكانها، وأضف صفوفًا جديدة، ثم احفظ الجدول مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>محفوظ في قاعدة البيانات</small><strong>{money(savedTotal)} <small>ر.س</small></strong></div>
          <div><small style={{display:'block',opacity:.65}}>إجمالي الجدول الحالي</small><strong>{money(currentGridTotal)} <small>ر.س</small></strong></div>
          {employeeDue>0&&<div><small style={{display:'block',opacity:.65}}>مستحق لموظفين</small><strong>{money(employeeDue)} <small>ر.س</small></strong></div>}
        </div>
      </div>

      {feedback&&<div className={feedback.type==='error'?styles.panelError:styles.panelSuccess}>{feedback.text}</div>}

      {loading?<div className={styles.panelEmpty}>جارٍ تحميل المصروفات المسجلة لهذا التاريخ…</div>:<>
        <div style={{overflowX:'auto',marginTop:12,borderRadius:12,border:'1px solid rgba(148,163,184,.18)',width:'100%'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1180,fontSize:12}}>
            <thead><tr>
              <th style={cellStyle}>#</th><th style={cellStyle}>الحالة</th><th style={cellStyle}>التاريخ</th><th style={cellStyle}>المبلغ</th><th style={cellStyle}>التصنيف</th>
              <th style={{...cellStyle,minWidth:260}}>البيان</th><th style={cellStyle}>من دفع؟</th><th style={cellStyle}>الموظف</th><th style={cellStyle}>على من؟</th><th style={{...cellStyle,minWidth:190}}>البند</th><th style={cellStyle}>إجراء</th>
            </tr></thead>
            <tbody>{entryRows.map((r,index)=>{
              const fieldStyle=r.persisted?savedInputStyle:inputStyle;
              return <tr key={r._id} style={{background:r.persisted?'rgba(111,37,43,.018)':'transparent'}}>
                <td style={{...cellStyle,textAlign:'center'}}>{index+1}</td>
                <td style={{...cellStyle,textAlign:'center',fontWeight:800,color:r.persisted?'#126548':'#6b6761'}}>{r.persisted?'محفوظ':'جديد'}</td>
                <td style={cellStyle}><input style={fieldStyle} type="date" value={r.expense_date} onChange={e=>patchEntry(r._id,{expense_date:e.target.value})}/></td>
                <td style={cellStyle}><input style={fieldStyle} type="number" min="0" step="0.01" value={r.amount} onChange={e=>patchEntry(r._id,{amount:e.target.value})}/></td>
                <td style={cellStyle}><select style={fieldStyle} value={r.category} onChange={e=>patchEntry(r._id,{category:e.target.value})}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></td>
                <td style={cellStyle}><input style={fieldStyle} value={r.notes} placeholder="بيان المصروف" onChange={e=>patchEntry(r._id,{notes:e.target.value})}/></td>
                <td style={cellStyle}><select style={fieldStyle} value={r.payer} onChange={e=>patchEntry(r._id,{payer:e.target.value,paid_by_employee_id:e.target.value==='employee'?r.paid_by_employee_id:''})}>{Object.entries(PAYER_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
                <td style={cellStyle}>{r.payer==='employee'?<select style={fieldStyle} value={r.paid_by_employee_id} onChange={e=>patchEntry(r._id,{paid_by_employee_id:e.target.value})}><option value="">اختر الموظف</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name_ar}</option>)}</select>:<span style={{opacity:.45}}>—</span>}</td>
                <td style={cellStyle}><select style={fieldStyle} value={r.charge_to} onChange={e=>patchEntry(r._id,{charge_to:e.target.value})}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
                <td style={cellStyle}><select style={fieldStyle} value={r.project_item_id} onChange={e=>patchEntry(r._id,{project_item_id:e.target.value})}><option value="">مصروف عام — بدون بند</option>{items.map(i=><option key={i.id} value={i.id}>{i.description_ar}</option>)}</select></td>
                <td style={{...cellStyle,textAlign:'center'}}><button type="button" onClick={()=>removeRow(r)} disabled={busy} style={{padding:'7px 9px'}}>{r.persisted?'حذف':'×'}</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>

        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:12}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" onClick={()=>addRows(4)} disabled={busy}>+ 4 صفوف</button>
            <button type="button" onClick={duplicatePrevious} disabled={busy}>نسخ إعدادات آخر صف</button>
            <button type="button" onClick={load} disabled={busy}>إعادة تحميل اليوم</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <strong>جاهز للحفظ: {validRows.length} حركة · {money(currentGridTotal)} ر.س</strong>
            <button className={styles.primaryAction} type="button" onClick={saveGrid} disabled={busy||!validRows.length}>{busy?'جارٍ الحفظ…':'حفظ تحديثات ومصروفات اليوم'}</button>
          </div>
        </div>
      </>}
    </main>
  </section>;
}
