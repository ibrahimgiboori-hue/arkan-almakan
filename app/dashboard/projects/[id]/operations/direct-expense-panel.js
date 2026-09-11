'use client';

import { useEffect, useMemo, useState } from 'react';
import { projectDirectExpenseService } from '@/lib/application/project-direct-expense-service';
import {
  DIRECT_EXPENSE_CATEGORIES,
  DIRECT_EXPENSE_CHARGE_LABELS,
  DIRECT_EXPENSE_PAYER_LABELS,
  createDirectExpenseDraft,
  duplicateDirectExpenseSeed,
  summarizeDirectExpenseGrid,
} from '@/lib/project-direct-expenses.mjs';
import { useCachedQuery, invalidateCachedQuery } from '@/lib/useCachedQuery';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits:2 });

export default function DirectExpensePanel({ projectId, date, contractor }){
  const cacheKey = projectId && date && contractor?.id ? `expenses:${projectId}:${date}:${contractor.id}` : null;
  const { data, loading, error:loadError, reload } = useCachedQuery(
    cacheKey,
    () => projectDirectExpenseService.loadDay({projectId,date,contractorId:contractor.id}),
  );
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
    const blanks = Array.from({ length: Math.max(4, 6 - saved.length) }, () => createDirectExpenseDraft(date));
    return [...saved, ...blanks];
  }, [draftRows, data, date]);

  const gridSummary=useMemo(()=>summarizeDirectExpenseGrid(entryRows),[entryRows]);
  const {savedRows,validRows,savedTotal,currentGridTotal,employeeDue}=gridSummary;

  function patchEntry(rowKey,patch){
    setDraftRows(prev=>(prev||entryRows).map(r=>r._id===rowKey?{...r,...patch}:r));
  }

  function addRows(count=4){
    setDraftRows(prev=>[...(prev||entryRows),...Array.from({length:count},()=>createDirectExpenseDraft(date))]);
  }

  function duplicatePrevious(){
    setDraftRows(prev=>{
      const base = prev||entryRows;
      const last=[...base].reverse().find(r=>r.amount||r.notes) || base[base.length-1];
      return [...base,createDirectExpenseDraft(date,duplicateDirectExpenseSeed(last,date))];
    });
  }

  function resetDrafts(){ setDraftRows(null); }

  async function removeRow(row){
    if(!row.persisted){
      setDraftRows(prev=>{
        const base=(prev||entryRows);
        return base.length>1?base.filter(r=>r._id!==row._id):[createDirectExpenseDraft(date)];
      });
      return;
    }
    if(!window.confirm(`حذف المصروف ${money(row.amount)} ر.س من هذا اليوم؟`))return;
    setBusy(true);setFeedback(null);
    try{
      await projectDirectExpenseService.deleteExpense({projectId,expenseId:row.id});
      setFeedback({type:'success',text:'تم حذف المصروف من اليوم وتحديث بيانات المشروع.'});
      invalidateCachedQuery(cacheKey);
      resetDrafts();
      await reload();
    }catch(e){setFeedback({type:'error',text:'تعذر حذف المصروف: '+(e.message||e)});}
    setBusy(false);
  }

  async function saveGrid(){
    setBusy(true);setFeedback(null);
    try{
      const result=await projectDirectExpenseService.saveGrid({
        projectId,
        contractorId:contractor.id,
        date,
        rows:entryRows,
      });
      setFeedback({type:'success',text:`تم حفظ الجدول: ${result.updatedCount} حركة محدثة و${result.createdCount} حركة جديدة. إجمالي الجدول ${money(result.total)} ر.س.`});
      invalidateCachedQuery(cacheKey);
      resetDrafts();
      await reload();
    }catch(e){setFeedback({type:'error',text:e?.code?'تعذر حفظ جدول المصروفات: '+e.message:'تعذر حفظ جدول المصروفات: '+(e.message||e)});}
    setBusy(false);
  }

  const columns = [
    { key:'_index', label:'#', type:'index', render:(row)=>entryRows.indexOf(row)+1 },
    { key:'_status', label:'الحالة', type:'badge', text:(row)=>row.persisted?'محفوظ':'جديد', tone:(row)=>row.persisted?'saved':'new' },
    { key:'expense_date', label:'التاريخ', type:'date' },
    { key:'amount', label:'المبلغ', type:'number', min:0, step:0.01 },
    { key:'category', label:'التصنيف', type:'select', options: DIRECT_EXPENSE_CATEGORIES.map(c=>({value:c,label:c})) },
    { key:'notes', label:'البيان', type:'text', placeholder:'بيان المصروف', minWidth:260 },
    {
      key:'payer', label:'من دفع؟', type:'select',
      options: Object.entries(DIRECT_EXPENSE_PAYER_LABELS).map(([value,label])=>({value,label})),
      onChange:(row,value)=>({ payer:value, paid_by_employee_id: value==='employee'?row.paid_by_employee_id:'' }),
    },
    {
      key:'paid_by_employee_id', label:'الموظف', type:'select', minWidth:190,
      visible:(row)=>row.payer==='employee',
      emptyOption:'اختر الموظف',
      options: employees.map(emp=>({value:emp.id,label:emp.full_name_ar})),
    },
    { key:'charge_to', label:'على من؟', type:'select', options: Object.entries(DIRECT_EXPENSE_CHARGE_LABELS).map(([value,label])=>({value,label})) },
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
