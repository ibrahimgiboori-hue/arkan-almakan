'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import styles from './operations.module.css';

const CATEGORIES = ['وجبات','أجور','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','وقود ومحروقات','تأمين مسترد','عهدة','تأمين طبي','ضيافة','أخرى'];
const PAYER_AR = { contractor:'المقاول', arkan_custody:'أركان من العهدة', arkan_direct:'أركان مباشرة' };
const CHARGE_AR = { arkan:'أركان', contractor:'المقاول', owner:'المالك' };
const SOURCE_AR = { bank:'تحويل بنكي', cash:'نقدًا', custody:'من عهدة' };
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function verifiedWrite({ operation, projectId, date, payload, onQueueChange }) {
  const result = await saveOperationWithQueue({
    operation,
    projectId,
    workDate: date,
    payload,
    batchId: null,
    sourceKind: 'live',
    sourceRef: null,
    certainty: 'confirmed',
  });
  onQueueChange?.(result.pendingCount || 0);
  return result;
}

function Feedback({ value }) {
  if (!value) return null;
  return <div className={value.type === 'error' ? styles.panelError : styles.panelSuccess}>{value.text}</div>;
}

function PanelEmpty({ children }) {
  return <div className={styles.panelEmpty}>{children}</div>;
}

export function OutputPanel({ projectId, date, contractor, onQueueChange }) {
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ item_id:'', qty:'', notes:'' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    if (!projectId || !date || !contractor?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const [itemsQ, dayQ, linksQ] = await Promise.all([
        supabase.from('project_items').select('id,description_ar,unit,sort_order').eq('project_id', projectId).eq('kind', 'item').order('sort_order'),
        supabase.from('timesheet_days').select('id').eq('project_id', projectId).eq('work_date', date).maybeSingle(),
        supabase.from('v_item_assignments').select('project_item_id,contractor_id,start_date,end_date,is_active').eq('project_id', projectId).eq('contractor_id', contractor.id),
      ]);
      if (itemsQ.error) throw itemsQ.error;
      if (dayQ.error) throw dayQ.error;
      setItems(itemsQ.data || []);
      setLinks(linksQ.error ? [] : (linksQ.data || []));
      if (dayQ.data?.id) {
        const q = await supabase.from('day_items').select('id,project_item_id,contractor_id,group_output,unit,notes').eq('day_id', dayQ.data.id).eq('contractor_id', contractor.id);
        if (q.error) throw q.error;
        setRows(q.data || []);
      } else setRows([]);
    } catch (e) {
      setFeedback({ type:'error', text:'تعذر تحميل إنجاز اليوم: ' + (e.message || e) });
    }
    setLoading(false);
  }, [projectId, date, contractor?.id]);

  useEffect(() => { load(); }, [load]);

  const availableItems = useMemo(() => {
    const activeLinks = links.filter((x) => x.is_active !== false && (!x.start_date || x.start_date <= date) && (!x.end_date || x.end_date >= date));
    if (!activeLinks.length) return items;
    const ids = new Set(activeLinks.map((x) => x.project_item_id));
    return items.filter((x) => ids.has(x.id));
  }, [items, links, date]);

  useEffect(() => {
    if (!availableItems.length) return;
    setForm((current) => availableItems.some((x) => x.id === current.item_id) ? current : { ...current, item_id:availableItems[0].id });
  }, [availableItems]);

  async function save(e) {
    e.preventDefault();
    const item = availableItems.find((x) => x.id === form.item_id);
    if (!item || !Number(form.qty)) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await verifiedWrite({
        operation:'output', projectId, date, onQueueChange,
        payload:{ contractor_id:contractor.id, item_id:item.id, qty:Number(form.qty), unit:item.unit || null, notes:form.notes || null },
      });
      setFeedback({ type:'success', text:result.status === 'queued' ? 'حُفظ الإنجاز على هذا الجهاز وينتظر الاتصال.' : `تم حفظ الإنجاز — ${receiptLabel(result.receipt)}` });
      setForm((current) => ({ ...current, qty:'', notes:'' }));
      if (result.status === 'verified') await load();
    } catch (e) {
      setFeedback({ type:'error', text:'تعذر حفظ الإنجاز: ' + (e.message || e) });
    }
    setBusy(false);
  }

  const totalQty = rows.reduce((sum, row) => sum + Number(row.group_output || 0), 0);

  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}><div><span>DAILY OUTPUT</span><h2>الإنجاز اليومي</h2><p>سجّل الكمية المنفذة اليوم على البند المرتبط بالمقاول.</p></div><strong>{rows.length}</strong></div>
      <Feedback value={feedback}/>
      {loading ? <PanelEmpty>جارٍ تحميل البنود…</PanelEmpty> : !availableItems.length ? <PanelEmpty>لا توجد بنود متاحة لهذا المقاول في المشروع.</PanelEmpty> : <form className={styles.operationForm} onSubmit={save}>
        <label className={styles.wideField}><span>البند</span><select value={form.item_id} onChange={(e) => setForm((f) => ({ ...f, item_id:e.target.value }))}>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.description_ar} — {item.unit || 'وحدة'}</option>)}</select></label>
        <label><span>الكمية المنفذة</span><input autoFocus required type="number" min="0" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty:e.target.value }))}/></label>
        <label><span>ملاحظة</span><input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))} placeholder="اختياري"/></label>
        <button className={styles.primaryAction} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الإنجاز'}</button>
      </form>}
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{money(totalQty)}</b></div>
      <div className={styles.activityList}>{rows.length ? rows.map((row) => {
        const item = items.find((x) => x.id === row.project_item_id);
        return <div className={styles.activityRow} key={row.id}><div><strong>{item?.description_ar || 'بند'}</strong><small>{row.notes || 'بدون ملاحظة'}</small></div><b>{money(row.group_output)} {row.unit || item?.unit || ''}</b></div>;
      }) : <PanelEmpty>لا يوجد إنجاز مسجل لهذا المقاول اليوم.</PanelEmpty>}</div>
    </aside>
  </section>;
}

export function ExpensePanel({ projectId, date, contractor, onQueueChange }) {
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ amount:'', notes:'', category:'مواد', payer:'contractor', charge_to:'arkan', is_recoverable:false, project_item_id:'' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    if (!projectId || !date || !contractor?.id) return;
    setLoading(true); setFeedback(null);
    try {
      const [itemsQ, rowsQ] = await Promise.all([
        supabase.from('project_items').select('id,description_ar').eq('project_id', projectId).eq('kind', 'item').order('sort_order'),
        supabase.from('contractor_expenses').select('id,category,amount,notes,is_recoverable,payer,charge_to,project_item_id').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('expense_date', date).order('created_at'),
      ]);
      const error = [itemsQ, rowsQ].find((x) => x.error)?.error;
      if (error) throw error;
      setItems(itemsQ.data || []); setRows(rowsQ.data || []);
    } catch (e) { setFeedback({ type:'error', text:'تعذر تحميل مصروفات اليوم: ' + (e.message || e) }); }
    setLoading(false);
  }, [projectId, date, contractor?.id]);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    if (!Number(form.amount) || !form.notes.trim()) return;
    setBusy(true); setFeedback(null);
    try {
      const recoverable = form.payer !== 'contractor' && !!form.is_recoverable;
      const result = await verifiedWrite({
        operation:'expense', projectId, date, onQueueChange,
        payload:{
          contractor_id:contractor.id,
          amount:Number(form.amount), category:form.category, payer:form.payer, charge_to:form.charge_to,
          is_recoverable:recoverable, project_item_id:recoverable ? null : (form.project_item_id || null), notes:form.notes.trim(),
        },
      });
      setFeedback({ type:'success', text:result.status === 'queued' ? 'حُفظ المصروف على الجهاز وينتظر الاتصال.' : `تم حفظ المصروف — ${receiptLabel(result.receipt)}` });
      setForm((f) => ({ ...f, amount:'', notes:'', project_item_id:'' }));
      if (result.status === 'verified') await load();
    } catch (e) { setFeedback({ type:'error', text:'تعذر حفظ المصروف: ' + (e.message || e) }); }
    setBusy(false);
  }

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}><div><span>EXPENSES / CUSTODY</span><h2>المصروفات والعهد</h2><p>اختر من دفع المصروف؛ ويمكن تسجيل الصرف من عهدة أركان من نفس النموذج.</p></div><strong>{money(total)} <small>ر.س</small></strong></div>
      <Feedback value={feedback}/>
      {loading ? <PanelEmpty>جارٍ تحميل مصروفات اليوم…</PanelEmpty> : <form className={styles.operationForm} onSubmit={save}>
        <label><span>المبلغ</span><input autoFocus required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount:e.target.value }))}/></label>
        <label><span>التصنيف</span><select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category:e.target.value }))}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className={styles.wideField}><span>البيان</span><input required value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))} placeholder="مثال: بنزين سيارة الموقع"/></label>
        <label><span>من دفع؟</span><select value={form.payer} onChange={(e) => { const payer=e.target.value; setForm((f) => ({ ...f, payer, is_recoverable:payer === 'contractor' ? false : f.is_recoverable })); }}>{Object.entries(PAYER_AR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span>على من؟</span><select value={form.charge_to} onChange={(e) => setForm((f) => ({ ...f, charge_to:e.target.value }))}>{Object.entries(CHARGE_AR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {form.payer !== 'contractor' && <label><span>طبيعة المبلغ</span><select value={form.is_recoverable ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_recoverable:e.target.value === '1', project_item_id:e.target.value === '1' ? '' : f.project_item_id }))}><option value="0">مصروف نهائي</option><option value="1">قابل للاسترداد لأركان</option></select></label>}
        {!form.is_recoverable && <label><span>البند إن كان مباشرًا</span><select value={form.project_item_id} onChange={(e) => setForm((f) => ({ ...f, project_item_id:e.target.value }))}><option value="">غير مرتبط ببند</option>{items.map((item) => <option key={item.id} value={item.id}>{item.description_ar}</option>)}</select></label>}
        <button className={styles.primaryAction} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ المصروف'}</button>
      </form>}
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>مصروف اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{money(total)} ر.س</b></div>
      <div className={styles.activityList}>{rows.length ? rows.map((row) => <div className={styles.activityRow} key={row.id}><div><strong>{row.category}</strong><small>{row.notes || PAYER_AR[row.payer] || '—'}</small></div><b>{money(row.amount)} ر.س</b></div>) : <PanelEmpty>لا توجد مصروفات لهذا المقاول اليوم.</PanelEmpty>}</div>
    </aside>
  </section>;
}

export function FinancePanel({ projectId, date, contractor, onQueueChange }) {
  const [kind, setKind] = useState('advance');
  const [advances, setAdvances] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ amount:'', notes:'', source:'bank', reference:'' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    if (!projectId || !date || !contractor?.id) return;
    setFeedback(null);
    try {
      const [a, p] = await Promise.all([
        supabase.from('contractor_advances').select('id,amount,remaining,notes').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('advance_date', date).order('created_at'),
        supabase.from('contractor_payments').select('id,amount,kind,source,reference,notes').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('payment_date', date).order('created_at'),
      ]);
      const error = [a,p].find((x) => x.error)?.error; if (error) throw error;
      setAdvances(a.data || []); setPayments(p.data || []);
    } catch (e) { setFeedback({ type:'error', text:'تعذر تحميل السلف والدفعات: ' + (e.message || e) }); }
  }, [projectId, date, contractor?.id]);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault(); if (!Number(form.amount)) return;
    setBusy(true); setFeedback(null);
    try {
      const payload = kind === 'advance'
        ? { contractor_id:contractor.id, amount:Number(form.amount), notes:form.notes || null }
        : { contractor_id:contractor.id, amount:Number(form.amount), kind:'on_account', source:form.source, reference:form.reference || null, notes:form.notes || null };
      const result = await verifiedWrite({ operation:kind, projectId, date, payload, onQueueChange });
      setFeedback({ type:'success', text:result.status === 'queued' ? 'حُفظت الحركة على الجهاز وتنتظر الاتصال.' : `تم حفظ الحركة — ${receiptLabel(result.receipt)}` });
      setForm({ amount:'', notes:'', source:'bank', reference:'' });
      if (result.status === 'verified') await load();
    } catch (e) { setFeedback({ type:'error', text:'تعذر حفظ الحركة: ' + (e.message || e) }); }
    setBusy(false);
  }

  const advanceTotal = advances.reduce((s,x) => s + Number(x.amount || 0), 0);
  const paymentTotal = payments.reduce((s,x) => s + Number(x.amount || 0), 0);

  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}><div><span>ADVANCES / PAYMENTS</span><h2>السلف والدفعات</h2><p>سجّل السلفة أو الدفعة للمقاول من نفس سياق المشروع واليوم.</p></div><strong>{money(advanceTotal + paymentTotal)} <small>ر.س</small></strong></div>
      <Feedback value={feedback}/>
      <div className={styles.typeTabs}><button className={kind === 'advance' ? styles.typeOn : ''} onClick={() => setKind('advance')}>سلفة</button><button className={kind === 'payment' ? styles.typeOn : ''} onClick={() => setKind('payment')}>دفعة</button></div>
      <form className={styles.operationForm} onSubmit={save}>
        <label><span>المبلغ</span><input autoFocus required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount:e.target.value }))}/></label>
        {kind === 'payment' && <label><span>طريقة الدفع</span><select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source:e.target.value }))}>{Object.entries(SOURCE_AR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        {kind === 'payment' && <label><span>المرجع</span><input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference:e.target.value }))} placeholder="رقم التحويل أو السند"/></label>}
        <label className={kind === 'advance' ? styles.wideField : ''}><span>ملاحظة</span><input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes:e.target.value }))} placeholder={kind === 'advance' ? 'سبب السلفة أو مرجعها' : 'اختياري'}/></label>
        <button className={styles.primaryAction} disabled={busy}>{busy ? 'جارٍ الحفظ…' : kind === 'advance' ? 'حفظ السلفة' : 'حفظ الدفعة'}</button>
      </form>
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>حركة اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{advances.length + payments.length}</b></div>
      <div className={styles.activityList}>
        {advances.map((row) => <div className={styles.activityRow} key={`a-${row.id}`}><div><strong>سلفة</strong><small>{row.notes || '—'}</small></div><b>{money(row.amount)} ر.س</b></div>)}
        {payments.map((row) => <div className={styles.activityRow} key={`p-${row.id}`}><div><strong>دفعة · {SOURCE_AR[row.source] || row.source || '—'}</strong><small>{row.reference || row.notes || '—'}</small></div><b>{money(row.amount)} ر.س</b></div>)}
        {!advances.length && !payments.length && <PanelEmpty>لا توجد سلف أو دفعات لهذا المقاول اليوم.</PanelEmpty>}
      </div>
    </aside>
  </section>;
}

export function MovementsPanel({ projectId, date, contractor }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ output:0, expenses:0, advances:0, payments:0, attendance:0 });
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    if (!projectId || !date || !contractor?.id) return;
    setFeedback(null);
    try {
      const dayQ = await supabase.from('timesheet_days').select('id').eq('project_id', projectId).eq('work_date', date).maybeSingle();
      if (dayQ.error) throw dayQ.error;
      const [outQ, expQ, advQ, payQ, attQ] = await Promise.all([
        dayQ.data?.id ? supabase.from('day_items').select('id,group_output,unit,notes,project_item_id').eq('day_id', dayQ.data.id).eq('contractor_id', contractor.id) : Promise.resolve({data:[],error:null}),
        supabase.from('contractor_expenses').select('id,category,amount,notes').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('expense_date', date),
        supabase.from('contractor_advances').select('id,amount,notes').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('advance_date', date),
        supabase.from('contractor_payments').select('id,amount,source,reference,notes').eq('project_id', projectId).eq('contractor_id', contractor.id).eq('payment_date', date),
        dayQ.data?.id ? supabase.from('attendance').select('id,status').eq('day_id', dayQ.data.id).eq('contractor_id_snapshot', contractor.id) : Promise.resolve({data:[],error:null}),
      ]);
      const error = [outQ,expQ,advQ,payQ,attQ].find((x) => x.error)?.error; if (error) throw error;
      const unified = [
        ...(outQ.data || []).map((x) => ({ id:`o-${x.id}`, type:'إنجاز', title:`${money(x.group_output)} ${x.unit || ''}`, note:x.notes || 'كمية منفذة' })),
        ...(expQ.data || []).map((x) => ({ id:`e-${x.id}`, type:'مصروف', title:`${money(x.amount)} ر.س`, note:`${x.category}${x.notes ? ` · ${x.notes}` : ''}` })),
        ...(advQ.data || []).map((x) => ({ id:`a-${x.id}`, type:'سلفة', title:`${money(x.amount)} ر.س`, note:x.notes || '—' })),
        ...(payQ.data || []).map((x) => ({ id:`p-${x.id}`, type:'دفعة', title:`${money(x.amount)} ر.س`, note:x.reference || x.notes || SOURCE_AR[x.source] || '—' })),
      ];
      setRows(unified);
      setSummary({ output:(outQ.data || []).length, expenses:(expQ.data || []).reduce((s,x) => s + Number(x.amount || 0),0), advances:(advQ.data || []).reduce((s,x) => s + Number(x.amount || 0),0), payments:(payQ.data || []).reduce((s,x) => s + Number(x.amount || 0),0), attendance:(attQ.data || []).length });
    } catch (e) { setFeedback({ type:'error', text:'تعذر تحميل حركات اليوم: ' + (e.message || e) }); }
  }, [projectId, date, contractor?.id]);

  useEffect(() => { load(); }, [load]);

  return <section className={styles.movementsPane}>
    <div className={styles.panelTitle}><div><span>DAILY LEDGER</span><h2>حركات اليوم</h2><p>صورة موحدة لما تم تسجيله اليوم لهذا المقاول داخل المشروع.</p></div><strong>{rows.length}</strong></div>
    <Feedback value={feedback}/>
    <div className={styles.movementSummary}>
      <div><span>حضور مسجل</span><strong>{summary.attendance}</strong></div>
      <div><span>حركات إنجاز</span><strong>{summary.output}</strong></div>
      <div><span>مصروفات</span><strong>{money(summary.expenses)} <small>ر.س</small></strong></div>
      <div><span>سلف</span><strong>{money(summary.advances)} <small>ر.س</small></strong></div>
      <div><span>دفعات</span><strong>{money(summary.payments)} <small>ر.س</small></strong></div>
    </div>
    <div className={styles.ledgerList}>{rows.length ? rows.map((row) => <div className={styles.ledgerRow} key={row.id}><span>{row.type}</span><div><strong>{row.title}</strong><small>{row.note}</small></div></div>) : <PanelEmpty>لا توجد حركات أخرى مسجلة لهذا المقاول اليوم.</PanelEmpty>}</div>
  </section>;
}
