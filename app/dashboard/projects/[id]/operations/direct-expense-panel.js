'use client';

/**
 * REWRITTEN to use the shared RawGrid + useCachedQuery pattern instead of a
 * hand-rolled <table> with inline styles. Same exact screen, same exact
 * business logic (bulk RPC for new rows, per-row update for saved rows,
 * duplicate-last-row, delete-with-confirm) — only the grid rendering and
 * data loading are now the shared building blocks every other screen
 * should reuse, per the unification pass.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCachedQuery, invalidateCachedQuery } from '@/lib/useCachedQuery';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
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

async function fetchDayExpenses(projectId, date, contractorId) {
  const [itemsQ,rowsQ,employeesQ]=await Promise.all([
    supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
    supabase.from('contractor_expenses')
      .select('id,expense_date,category,amount,notes,is_recoverable,payer,charge_to,project_item_id,paid_by_employee_id,reimbursement_status,reimbursed_amount,created_at')
      .eq('project_id',projectId).eq('contractor_id',contractorId).eq('expense_date',date)
      .neq('payer','arkan_custody').order('created_at'),
    supabase.from('employees').select('id,full_name_ar,status').eq('status','active').order('full_name_ar'),
  ]);
  const error=[itemsQ,rowsQ,employeesQ].find(x=>x.error)?.error;
  if(error) throw error;
  return { items:itemsQ.data||[], employees:employeesQ.data||[], savedRows:(rowsQ.data||[]).map(row=>dbRowToGrid(row,date)) };
}

export default function DirectExpensePanel({ projectId, date, contractor }){
  const cacheKey = projectId && date && contractor?.id ? `expenses:${projectId}:${date}:${contractor.id}` : null;
  const { data, loading, error:loadError, reload } = useCachedQuery(cacheKey, () => fetchDayExpenses(projectId, date, contractor.id));
  const items = data?.items || [];
  const employees = data?.employees || [];

  const [draftRows,setDraftRows] = useState(null);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);
  const visibleFeedback = feedback || (loadError ? {type:'error',text:'تعذر تحميل مصروفات هذا اليوم: '+(loadError.message||loadError)} : null);

  useEffect(() => {
    setDraftRows(null);
    setFeedback(null);
  }, [cacheKey]);

  const entryRows = useMemo(() => {
    if (draftRows) return draftRows;
    const saved = data?.savedRows || [];
    const blanks = Array.from({ length: Math.max(4, 6 - saved.length) }, () => freshRow(date));
    return [...saved, ...blanks];
  }, [draftRows, data, date]);

  const savedRows=useMemo(()=>entryRows.filter(r=>r.persisted),[entryRows]);
  const validRows=useMemo(()=>entryRows.filter(r=>Number(r.amount)>0&&r.notes.trim()),[entryRows]);
  const newRows=useMemo(()=>validRows.filter(r=>!r.persisted),[validRows]);
  const savedTotal=useMemo(()=>savedRows.reduce((sum,r)=>sum+Number(r.amount||0),0),[savedRows]);
  const currentGridTotal=useMemo(()=>validRows.reduce((sum,r)=>sum+Number(r.amount||0),0),[validRows]);
  const employeeDue=useMemo(()=>savedRows.reduce((sum,r)=>sum+(r.paid_by_employee_id?Math.max(0,Number(r.amount||0)-Number(r.reimbursed_amount||0)):0),0),[savedRows]);

  function patchEntry(rowKey,patch){
    setDraftRows(prev=>(prev||entryRows).map(r=>r._id===rowKey?{...r,...patch}:r));
  }

  function addRows(count=4){
    setDraftRows(prev=>[...(prev||entryRows),...Array.from({length:count},()=>freshRow(date))]);
  }

  function duplicatePrevious(){
    setDraftRows(prev=>{
      const base = prev||entryRows;
      const last=[...base].reverse().find(r=>r.amount||r.notes) || base[base.length-1];
      const seed=last?{
        expense_date:last.expense_date||date,
        category:last.category,
        payer:last.payer,
        charge_to:last.charge_to,
        project_item_id:last.project_item_id,
        paid_by_employee_id:last.paid_by_employee_id,
      }:{};
      return [...base,freshRow(date,seed)];
    });
  }

  function resetDrafts(){ setDraftRows(null); }

  async function removeRow(row){
    if(!row.persisted){
      setDraftRows(prev=>{
        const base=(prev||entryRows);
        return base.length>1?base.filter(r=>r._id!==row._id):[freshRow(date)];
      });
      return;
    }
    if(!window.confirm(`حذف المصروف ${money(row.amount)} ر.س من هذا اليوم؟`))return;
    setBusy(true);setFeedback(null);
    try{
      const {error}=await supabase.from('contractor_expenses').delete().eq('id',row.id).eq('project_id',projectId);
      if(error)throw error;
      setFeedback({type:'success',text:'تم حذف المصروف من اليوم وتحديث بيانات المشروع.'});
      invalidateCachedQuery(cacheKey);
      resetDrafts();
      await reload();
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
      invalidateCachedQuery(cacheKey);
      resetDrafts();
      await reload();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ جدول المصروفات: '+(e.message||e)});}
    setBusy(false);
  }

  const columns = [
    { key:'_index', label:'#', type:'index', render:(row)=>entryRows.indexOf(row)+1 },
    { key:'_status', label:'الحالة', type:'badge', text:(row)=>row.persisted?'محفوظ':'جديد', tone:(row)=>row.persisted?'saved':'new' },
    { key:'expense_date', label:'التاريخ', type:'date' },
    { key:'amount', label:'المبلغ', type:'number', min:0, step:0.01 },
    { key:'category', label:'التصنيف', type:'select', options: CATEGORIES.map(c=>({value:c,label:c})) },
    { key:'notes', label:'البيان', type:'text', placeholder:'بيان المصروف', minWidth:260 },
    {
      key:'payer', label:'من دفع؟', type:'select',
      options: Object.entries(PAYER_AR).map(([value,label])=>({value,label})),
      onChange:(row,value)=>({ payer:value, paid_by_employee_id: value==='employee'?row.paid_by_employee_id:'' }),
    },
    {
      key:'paid_by_employee_id', label:'الموظف', type:'select', minWidth:190,
      visible:(row)=>row.payer==='employee',
      emptyOption:'اختر الموظف',
      options: employees.map(emp=>({value:emp.id,label:emp.full_name_ar})),
    },
    { key:'charge_to', label:'على من؟', type:'select', options: Object.entries(CHARGE_AR).map(([value,label])=>({value,label})) },
    {
      key:'project_item_id', label:'البند', type:'select', minWidth:190,
      emptyOption:'مصروف عام — بدون بند',
      options: items.map(i=>({value:i.id,label:i.description_ar})),
    },
    {
      key:'_action', label:'إجراء', type:'action',
      render:(row,{disabled})=>(
        <button type="button" className={rawGridStyles.actionButton} onClick={()=>removeRow(row)} disabled={disabled}>
          {row.persisted?'حذف':'×'}
        </button>
      ),
    },
  ];

  return <section style={{width:'100%',minWidth:0,borderTop:'1px solid var(--raw-border)'}}>
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

      {visibleFeedback&&<div className={visibleFeedback.type==='error'?styles.panelError:styles.panelSuccess}>{visibleFeedback.text}</div>}

      <RawGrid
        columns={columns}
        rows={entryRows}
        rowKey={(row)=>row._id}
        savedFlag={(row)=>row.persisted}
        onPatchRow={patchEntry}
        busy={busy}
        loading={loading && !data}
      />

      {!(loading && !data) && (
        <RawGridFooter
          actions={<>
            <button type="button" className={rawGridStyles.plainButton} onClick={()=>addRows(4)} disabled={busy}>+ 4 صفوف</button>
            <button type="button" className={rawGridStyles.plainButton} onClick={duplicatePrevious} disabled={busy}>نسخ إعدادات آخر صف</button>
            <button type="button" className={rawGridStyles.plainButton} onClick={()=>{resetDrafts();reload();}} disabled={busy}>إعادة تحميل اليوم</button>
          </>}
          summary={<>
            <strong>جاهز للحفظ: {validRows.length} حركة · {money(currentGridTotal)} ر.س</strong>
            <button className={rawGridStyles.primaryButton} type="button" onClick={saveGrid} disabled={busy||!validRows.length}>{busy?'جارٍ الحفظ…':'حفظ تحديثات ومصروفات اليوم'}</button>
          </>}
        />
      )}
    </main>
  </section>;
}
