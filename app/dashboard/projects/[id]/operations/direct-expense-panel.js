'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectDirectExpenseService } from '@/lib/application/project-direct-expense-service';
import {
  DIRECT_EXPENSE_CATEGORIES,
  DIRECT_EXPENSE_CHARGE_LABELS,
  DIRECT_EXPENSE_PAYER_LABELS,
  createDirectExpenseDraft,
  directExpenseLineTotal,
  directExpenseSignature,
  duplicateDirectExpenseSeed,
  summarizeDirectExpenseGrid,
} from '@/lib/project-direct-expenses.mjs';
import { projectLedgerMatches } from '@/lib/project-operation-context.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
const blankRows = (count, date, contractorId) => [...Array(count)].map(() => createDirectExpenseDraft(date, { contractor_id: contractorId || '' }));
const isBlank = (row) => !row.persisted && !row.amount && !row.quantity && !row.unit_price && !String(row.notes || '').trim();

/**
 * سجل مصروفات المشروع: ورقة واحدة مستمرة لكل المقاولين وكل الأيام. الفلترة (المقاول، الفترة، البحث)
 * تحدد ما يظهر. المحفوظ يُعدَّل مكانه، والجديد يُكتب أو يُلصق أسفل السجل بتاريخه ومقاوله،
 * ثم يُحفظ مرة واحدة: تحديث ما تغيّر فعلًا، وإنشاء الجديد دفعة لكل مقاول.
 */
export default function DirectExpensePanel({ projectId, contractors = [], contractorId = '', from, to, search = '', entryDate, service = projectDirectExpenseService }){
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [edits,setEdits] = useState({});
  const [drafts,setDrafts] = useState(() => blankRows(4, entryDate, contractorId));
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!projectId || !from || !to) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const result = await service.loadRange({ projectId, from, to, contractorId });
      if (seq !== loadSeqRef.current) return;
      setData(result);
      setEdits({});
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setData(null);
      setFeedback({ type:'error', text:'تعذر تحميل سجل المصروفات: '+(e.message||e)+' — لم تُعرض حالة فارغة بديلة.' });
    }
    if (seq === loadSeqRef.current) setLoading(false);
  }, [projectId, from, to, contractorId, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFeedback(null); }, [projectId, from, to, contractorId]);
  // Untouched new rows follow the entry day and the contractor filter.
  useEffect(() => {
    setDrafts((current) => current.map((row) => (isBlank(row) ? { ...row, expense_date: entryDate, contractor_id: contractorId || row.contractor_id } : row)));
  }, [entryDate, contractorId]);

  const items = data?.items || [];
  const employees = data?.employees || [];
  const baseline = data?.baseline || {};
  const contractorName = useMemo(() => {
    const byId = new Map(contractors.map((c) => [c.id, c.operation_alias || c.name_ar]));
    return (id) => byId.get(id) || '';
  }, [contractors]);
  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.description_ar])), [items]);

  const savedRows = useMemo(() => (data?.savedRows || []).map((row) => (edits[row._id] ? { ...row, ...edits[row._id] } : row)), [data, edits]);
  const visibleSaved = useMemo(() => {
    const original = new Map((data?.savedRows || []).map((row) => [row._id, row]));
    return savedRows.filter((row) => {
      const o = original.get(row._id) || row;
      return projectLedgerMatches(search, o.notes, o.category, contractorName(o.contractor_id), itemName.get(o.project_item_id));
    });
  }, [savedRows, data, search, contractorName, itemName]);
  const rows = useMemo(() => [...visibleSaved, ...drafts], [visibleSaved, drafts]);
  const isDirty = (row) => row.persisted && baseline[row.id] !== directExpenseSignature(row);
  const hiddenEdited = savedRows.filter((row) => isDirty(row) && !visibleSaved.includes(row));

  const { validRows, savedTotal, currentGridTotal, employeeDue } = summarizeDirectExpenseGrid(rows);
  const editedCount = savedRows.filter(isDirty).length;
  const newCount = drafts.filter((row) => !isBlank(row)).length;

  function patchRows(list){
    const draftPatches = new Map();
    const savedPatches = {};
    for (const { key, patch } of list) {
      if (drafts.some((row) => row._id === key)) draftPatches.set(key, { ...(draftPatches.get(key) || {}), ...patch });
      else savedPatches[key] = { ...(savedPatches[key] || {}), ...patch };
    }
    if (draftPatches.size) setDrafts((current) => current.map((row) => (draftPatches.has(row._id) ? { ...row, ...draftPatches.get(row._id) } : row)));
    if (Object.keys(savedPatches).length) setEdits((current) => {
      const next = { ...current };
      for (const [key, patch] of Object.entries(savedPatches)) next[key] = { ...(next[key] || {}), ...patch };
      return next;
    });
  }

  function appendPastedRows(patches){
    setDrafts((current) => [...current, ...patches.map((patch) => createDirectExpenseDraft(entryDate, { contractor_id: contractorId || '', ...patch }))]);
  }

  function duplicatePrevious(){
    setDrafts((current) => {
      const last = [...rows].reverse().find((row) => row.amount || row.notes) || current[current.length - 1];
      return [...current, createDirectExpenseDraft(entryDate, { contractor_id: last?.contractor_id || contractorId || '', ...duplicateDirectExpenseSeed(last, entryDate), expense_date: entryDate })];
    });
  }

  function resetEdits(){ setEdits({}); setDrafts(blankRows(4, entryDate, contractorId)); }

  async function removeRow(row){
    if (!row.persisted) {
      setDrafts((current) => (current.length > 1 ? current.filter((item) => item._id !== row._id) : blankRows(1, entryDate, contractorId)));
      return;
    }
    if (!window.confirm(`حذف المصروف ${money(directExpenseLineTotal(row))} ر.س بتاريخ ${row.expense_date}؟`)) return;
    setBusy(true); setFeedback(null);
    try {
      await service.deleteExpense({ projectId, expenseId:row.id });
      setFeedback({ type:'success', text:'تم حذف المصروف وتحديث بيانات المشروع.' });
      await load();
    } catch (e) { setFeedback({ type:'error', text:'تعذر حذف المصروف: '+(e.message||e) }); }
    setBusy(false);
  }

  async function saveLedger(){
    setBusy(true); setFeedback(null);
    try {
      const result = await service.saveLedger({ projectId, rows:[...rows, ...hiddenEdited], baseline, from, to });
      setFeedback({ type:'success', text:`تم الحفظ: ${result.updatedCount} مصروف معدل و${result.createdCount} مصروف جديد.` });
      setDrafts(blankRows(4, entryDate, contractorId));
      await load();
    } catch (e) {
      setFeedback({ type:'error', text:'تعذر حفظ المصروفات: '+(e.message||e) });
    }
    setBusy(false);
  }

  const columns = [
    { key:'_index', label:'#', type:'index', render:(row)=>rows.indexOf(row)+1 },
    { key:'_status', label:'الحالة', type:'badge', text:(row)=>row.persisted?(isDirty(row)?'معدل':'محفوظ'):'جديد', tone:(row)=>row.persisted&&!isDirty(row)?'saved':'new' },
    { key:'expense_date', label:'التاريخ', type:'date' },
    {
      key:'contractor_id', label:'المقاول', type:'select', minWidth:160, emptyOption:'اختر المقاول',
      options: contractors.map((c)=>({ value:c.id, label:c.operation_alias||c.name_ar })),
      visible:(row)=>!row.persisted,
      placeholderWhenHidden:(row)=>contractorName(row.contractor_id)||'—',
      sheetValue:(row)=>contractorName(row.contractor_id),
    },
    { key:'quantity', label:'الكمية', type:'number', min:0, step:'any' },
    { key:'unit_price', label:'سعر الوحدة', type:'number', min:0, step:0.01 },
    {
      key:'amount', label:'المبلغ المباشر', type:'number', min:0, step:0.01,
      visible:(row)=>!(row.quantity!==''&&row.unit_price!==''),
      placeholderWhenHidden:'ƒ',
    },
    {
      key:'_total', label:'الإجمالي', type:'computed', numeric:true, total:'sum',
      formula:'الكمية × سعر الوحدة (يحسبها البرنامج في القاعدة)، أو المبلغ المباشر',
      compute:(row)=>{const total=directExpenseLineTotal(row);return total>0?total:null;},
      format:(value)=>value==null?null:money(value),
    },
    { key:'category', label:'التصنيف', type:'select', options: DIRECT_EXPENSE_CATEGORIES.map(c=>({value:c,label:c})) },
    { key:'notes', label:'البيان', type:'text', placeholder:'بيان المصروف', minWidth:240 },
    {
      key:'payer', label:'من دفع؟', type:'select',
      options: Object.entries(DIRECT_EXPENSE_PAYER_LABELS).map(([value,label])=>({value,label})),
      onChange:(row,value)=>({ payer:value, paid_by_employee_id: value==='employee'?row.paid_by_employee_id:'' }),
    },
    {
      key:'paid_by_employee_id', label:'الموظف', type:'select', minWidth:170,
      visible:(row)=>row.payer==='employee',
      emptyOption:'اختر الموظف',
      options: employees.map(emp=>({value:emp.id,label:emp.full_name_ar})),
    },
    { key:'charge_to', label:'على من؟', type:'select', options: Object.entries(DIRECT_EXPENSE_CHARGE_LABELS).map(([value,label])=>({value,label})) },
    {
      key:'project_item_id', label:'البند', type:'select', minWidth:180,
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

  return <section style={{width:'100%',minWidth:0}} data-expense-ledger="project">
    <main className={styles.formPane} style={{width:'100%',minWidth:0,paddingInline:0}}>
      <div className={styles.panelTitle}>
        <div>
          <span>EXPENSES · PROJECT LEDGER</span>
          <h2>سجل المصروفات</h2>
          <p>كل مصروفات المشروع في ورقة واحدة. عدّل المحفوظ مكانه، واكتب الجديد أو الصقه من إكسل أسفل السجل بتاريخه ومقاوله، ثم احفظ مرة واحدة.</p>
        </div>
        <div style={{display:'flex',gap:18,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><small style={{display:'block',opacity:.65}}>محفوظ في الفترة</small><strong>{money(savedTotal)} <small>ر.س</small></strong></div>
          <div><small style={{display:'block',opacity:.65}}>إجمالي الورقة الحالي</small><strong>{money(currentGridTotal)} <small>ر.س</small></strong></div>
          {employeeDue>0&&<div><small style={{display:'block',opacity:.65}}>مستحق لموظفين</small><strong>{money(employeeDue)} <small>ر.س</small></strong></div>}
        </div>
      </div>

      {feedback&&<div className={feedback.type==='error'?styles.panelError:styles.panelSuccess}>{feedback.text}</div>}

      <RawGrid
        columns={columns}
        rows={rows}
        rowKey={(row)=>row._id}
        savedFlag={(row)=>row.persisted&&!isDirty(row)}
        onPatchRows={patchRows}
        onPatchRow={(key,patch)=>patchRows([{key,patch}])}
        onAppendRows={appendPastedRows}
        busy={busy}
        loading={loading && !data}
        emptyMessage="لا توجد مصروفات في هذه الفترة."
      />

      {!(loading && !data) && (
        <RawGridFooter
          actions={<>
            <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((current)=>[...current,...blankRows(4,entryDate,contractorId)])} disabled={busy}>+ 4 صفوف</button>
            <button type="button" className={rawGridStyles.plainButton} onClick={duplicatePrevious} disabled={busy}>نسخ إعدادات آخر صف</button>
            <button type="button" className={rawGridStyles.plainButton} onClick={resetEdits} disabled={busy||(!editedCount&&!newCount)}>تراجع عن التعديلات</button>
            <button type="button" className={rawGridStyles.plainButton} onClick={load} disabled={busy}>تحديث السجل</button>
          </>}
          summary={<>
            <strong>{editedCount||newCount?`معدل ${editedCount} · جديد ${newCount}`:`جاهز: ${validRows.length} حركة`}</strong>
            <button className={rawGridStyles.primaryButton} type="button" onClick={saveLedger} disabled={busy||(!editedCount&&!newCount)}>{busy?'جارٍ الحفظ…':'حفظ المصروفات'}</button>
          </>}
        />
      )}
    </main>
  </section>;
}
