'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, todayIsoInRiyadh } from '@/lib/format';
import { ITEM_EXECUTION_AR, ITEM_EXECUTION_CLASS, MODE_AR, itemExecutionState } from '@/lib/projects';
import ItemBudget from '@/components/ItemBudget';
import NumericField from '@/components/NumericField';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import styles from './proj-scope.module.css';
import { notifyChange, useLiveRefresh } from '@/lib/live';

export default function ProjScope({ projectId, canWrite, onChange }) {
  const [items, setItems] = useState(null);
  const [execs, setExecs] = useState([]);
  const [cons, setCons] = useState([]);
  const [decideFor, setDecideFor] = useState(null);
  const [editExec, setEditExec] = useState(null);
  const [tots, setTots] = useState([]);
  const [acts, setActs] = useState([]);
  const [endFor, setEndFor] = useState(null);
  const [endF, setEndF] = useState({});
  const [budgetFor, setBudgetFor] = useState(null);
  const [manageFor, setManageFor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState('');
  const [buds, setBuds] = useState([]);
  const [states, setStates] = useState([]);
  const [starting, setStarting] = useState(null);
  const [askStart, setAskStart] = useState(null);
  const [sDate, setSDate] = useState('');
  const [d, setD] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [i, e, c, bg, st, tt, ac] = await Promise.all([
      supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('v_item_execution_assignments').select('*').eq('project_id', projectId)
        .order('decided_at', { ascending: true }),
      supabase.from('contractors').select('id, name_ar, worker_daily, tech_daily')
        .eq('is_active', true).order('name_ar'),
      supabase.from('v_item_budget').select('*').eq('project_id', projectId),
      supabase.from('v_item_execution_state').select('*').eq('project_id', projectId),
      supabase.from('v_item_assignment_totals').select('*').eq('project_id', projectId),
      supabase.from('v_item_assignment_actuals').select('*'),
    ]);
    setItems(i.data || []); setExecs(e.data || []); setCons(c.data || []);
    setBuds(bg.data || []); setStates(st.data || []); setTots(tt.data || []);
    setActs(ac.data || []);
    onChange?.();
  }

  useEffect(() => { load(); }, [projectId]);
  useLiveRefresh(load, ['scope','budget','exec','all']);

  const execsOf = (id) => execs.filter((x) => x.project_item_id === id);
  const execOf = (id) => execsOf(id)[0];
  const totOf = (id) => tots.find((x) => x.project_item_id === id) || {};
  const actOf = (execId) => acts.find((x) => x.exec_id === execId) || {};

  const END_AR = {
    completed: 'اكتمال', mutual: 'اتفاق', underperformance: 'تقصير',
    dispute: 'خلاف', other: 'أخرى',
  };

  async function addLine(kind) {
    const order = (items.length ? Math.max(...items.map((l)=>l.sort_order)) : 0) + 1;
    const { error } = await supabase.from('project_items').insert({
      project_id: projectId, sort_order: order, kind,
      description_ar: kind === 'title' ? 'عنوان قسم' : '',
      unit: kind === 'item' ? 'م2' : null, contract_qty: 1, sell_price: 0, budget_cost: 0,
    });
    if (error) setErr('تعذّر الإضافة: ' + error.message);
    else { load(); notifyChange('scope'); }
  }

  async function insertAfter(afterOrder, kind) {
    const { error } = await supabase.rpc('project_item_insert_after', {
      p_project: projectId, p_after_order: afterOrder, p_kind: kind,
    });
    if (error) setErr('تعذّر الإدراج: ' + error.message); else load();
  }

  const CALC_FIELDS = ['contract_qty','sell_price','budget_cost'];

  async function upd(id, fields) {
    setItems(items.map((x) => x.id === id ? { ...x, ...fields } : x));
    const { error } = await supabase.from('project_items').update(fields).eq('id', id);
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }

    if (Object.keys(fields).some((k) => CALC_FIELDS.includes(k))) {
      await refreshCalc();
    }
    notifyChange('scope');
    onChange?.();
  }

  async function refreshCalc() {
    const [i, bg, st] = await Promise.all([
      supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('v_item_budget').select('*').eq('project_id', projectId),
      supabase.from('v_item_execution_state').select('*').eq('project_id', projectId),
    ]);
    if (i.data) setItems(i.data);
    setBuds(bg.data || []);
    setStates(st.data || []);
  }

  // التأكيد لم يعد داخل الدالة: الدالة تنفّذ فقط، والسؤال يعرضه الحوار الدستوري.
  // والحذف يمر ببوابة واحدة تحرس التاريخ التشغيلي بدل حذف مباشر من الواجهة.
  async function del(id) {
    const { data, error } = await supabase.rpc('fn_delete_project_item_safely', {
      p_project_item_id: id,
    });
    if (error) throw new Error('تعذّر الحذف: ' + error.message);
    if (!data?.deleted) throw new Error('لم يُحذف البند؛ أعد تحميل الصفحة وحاول مرة أخرى');
    const cancelled = Number(data.cancelled_planned_assignments || 0);
    setMsg(cancelled > 0
      ? `حُذف البند وأُلغي معه ${cancelled} إسناد مخطط.`
      : 'حُذف البند.');
    setManageFor(null); await load(); notifyChange('scope');
  }

  function requestDeleteItem(item) {
    setConfirmErr('');
    setConfirmAction({
      key: `delete-item-${item.id}`,
      title: `${item.kind === 'title' ? 'حذف القسم' : 'حذف البند'}: ${item.description_ar || item.number || 'بدون وصف'}`,
      description: 'الحذف نهائي ولا يمكن التراجع عنه.',
      confirmLabel: item.kind === 'title' ? 'حذف القسم' : 'حذف البند',
      busyLabel: 'جارٍ الحذف…',
      danger: true,
      body: (() => {
        const list = execsOf(item.id);
        const started = list.filter((a)=>itemExecutionState(a) !== 'planned');
        const planned = list.length - started.length;
        return (
          <div style={{lineHeight:1.7}}>
            <p style={{margin:0}}>
              الحذف نهائي. الإسناد الذي بدأ تنفيذه فعلًا لا يُحذف — يبقى تاريخه ويُنهى.
            </p>
            {planned > 0 && (
              <p style={{margin:'8px 0 0'}}>
                سيُلغى معه {planned} إسناد مخطط لم يبدأ بعد.
              </p>
            )}
            {started.length > 0 && (
              <p style={{margin:'8px 0 0'}}>
                يرتبط بالبند {started.length} إسناد بدأ تنفيذه — سيُرفض الحذف حتى يُنهى.
              </p>
            )}
          </div>
        );
      })(),
      run: () => del(item.id),
    });
  }

  function requestCancelAssignment(ex, item) {
    setConfirmErr('');
    const contractorName = cons.find((c)=>c.id===ex.contractor_id)?.name_ar || 'منفّذ غير محدد';
    setConfirmAction({
      key: `cancel-exec-${ex.id}`,
      title: `إلغاء إسناد: ${contractorName}`,
      description: item?.description_ar || '',
      confirmLabel: 'إلغاء الإسناد',
      busyLabel: 'جارٍ الإلغاء…',
      danger: true,
      body: (
        <p style={{margin:0,lineHeight:1.7}}>
          هذا الإسناد لم يبدأ تنفيذه بعد، فيُلغى بلا أثر تاريخي وتعود كميته إلى المتبقي.
          الإسناد الذي بدأ فعلًا لا يُلغى — يُنهى ليبقى تاريخه.
        </p>
      ),
      run: () => delDecision(ex),
    });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setConfirmBusy(true); setConfirmErr(''); setErr('');
    try {
      await confirmAction.run();
      setConfirmAction(null);
    } catch (e) {
      setConfirmErr(e?.message || String(e));
    }
    setConfirmBusy(false);
  }

  async function move(id, dir) {
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const a = items[i], b = items[j];
    await supabase.from('project_items').update({ sort_order: -1 }).eq('id', a.id);
    await supabase.from('project_items').update({ sort_order: a.sort_order }).eq('id', b.id);
    await supabase.from('project_items').update({ sort_order: b.sort_order }).eq('id', a.id);
    load();
  }

  function openDecide(item, ex) {
    const t = totOf(item.id);
    setManageFor(null); setAskStart(null); setEndFor(null); setBudgetFor(null);
    setDecideFor(item);
    setEditExec(ex || null);
    setD(ex ? { ...ex } : {
      mode: 'piecework', contractor_id: '', agreed_rate: '', worker_daily: '',
      tech_daily: '', target_output: '', shortfall_deduction: '', planned_cost: '',
      share_qty: t.qty_remaining != null ? String(t.qty_remaining) : '',
      notes: '',
    });
    setErr(''); setMsg('');
  }

  const nullableNumber = (value) => value === '' || value == null ? null : Number(value);

  async function saveDecision(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.rpc('fn_save_item_execution_assignment', {
      p_project_item_id: decideFor.id,
      p_mode: d.mode,
      p_contractor_id: d.contractor_id || null,
      p_agreed_rate: nullableNumber(d.agreed_rate),
      p_worker_daily: nullableNumber(d.worker_daily),
      p_tech_daily: nullableNumber(d.tech_daily),
      p_target_output: nullableNumber(d.target_output),
      p_shortfall_deduction: nullableNumber(d.shortfall_deduction),
      p_planned_cost: nullableNumber(d.planned_cost),
      p_share_qty: nullableNumber(d.share_qty),
      p_share_percent: nullableNumber(d.share_percent),
      p_notes: d.notes || null,
      p_execution_id: editExec?.id || null,
    });
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg(editExec ? 'حُدّث الإسناد' : 'أُضيف الإسناد');
    setDecideFor(null); setEditExec(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  async function startExec(ex, date) {
    setStarting(ex.id); setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('fn_start_item_execution_assignment',
      { p_execution_id: ex.id, p_start_date: date || null });
    setStarting(null);
    if (error) { setErr(error.message); return; }
    const parts = ['بدأ التنفيذ'];
    if (data?.created_project_contractor) parts.push('وتم ربط المقاول بالمشروع');
    else if (data?.reactivated_project_contractor) parts.push('وأُعيد تفعيل ارتباط المقاول بالمشروع');
    setMsg(parts.join(' ') + '.');
    setAskStart(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  function openEnd(ex, item) {
    setManageFor(null); setDecideFor(null); setAskStart(null); setBudgetFor(null);
    setEndFor({ ex, item });
    setEndF({ date: todayIsoInRiyadh(), reason: 'completed', qty: '' });
    setErr(''); setMsg('');
  }

  async function submitEnd(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.rpc('end_item_assignment', {
      p_exec: endFor.ex.id,
      p_end_date: endF.date,
      p_end_reason: endF.reason,
      p_closing_qty: endF.qty === '' ? null : Number(endF.qty),
      p_notes: endF.notes || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('أُقفل الإسناد وتحرّرت الكمية المتبقية.');
    setEndFor(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  async function delDecision(ex) {
    if (!ex) return;
    const { error } = await supabase.rpc('fn_cancel_item_execution_assignment', {
      p_execution_id: ex.id,
    });
    if (error) throw new Error('تعذّر الإلغاء: ' + error.message);
    setMsg('أُلغي الإسناد المخطط.');
    setManageFor(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  if (!items) return <div className="empty">جارٍ التحميل…</div>;

  let top = 0, sub = 0, inTitle = false;
  const numbered = items.map((l) => {
    let number = '';
    if (l.kind === 'title') { top += 1; sub = 0; inTitle = true; number = String(top); }
    else if (inTitle) { sub += 1; number = `${top}-${sub}`; }
    else { top += 1; number = String(top); }
    return { ...l, number };
  });

  const totalContract = items.reduce((t,x) => t + Number(x.contract_value || 0), 0);
  const totalBudget = items.reduce((t,x) => t + Number(x.budget_value || 0), 0);
  const noDecision = items.filter((x) => x.kind === 'item' && !execOf(x.id)).length;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {noDecision > 0 && (
        <div className="msg err" style={{marginBottom:12}}>
          {noDecision} بنداً بلا إسناد — لا يبدأ التنفيذ قبل إسناد منفّذ
        </div>
      )}

      {canWrite && (
        <div className={styles.toolbar}>
          <button className="btn" onClick={()=>addLine('item')}>+ بند جديد</button>
          <button className="btn ghost" onClick={()=>addLine('title')}>+ عنوان قسم</button>
          <div className={styles.toolbarSummary}>
            قيمة العقد {money(totalContract)} · الميزانية {money(totalBudget)} · الهامش المخطط {money(totalContract - totalBudget)}
          </div>
        </div>
      )}

      <div className={styles.tableFrame}>
        <table className={styles.table}>
<thead>
  <tr>
    <th className={styles.numberCol}>م</th>
    <th>بيان الأعمال</th>
    <th className={styles.unitCol}>الوحدة</th>
    <th className={styles.qtyCol}>الكمية</th>
    <th className={styles.moneyCol}>فئة البيع</th>
    <th className={styles.moneyCol}>تكلفة مخططة</th>
    <th className={styles.valueCol}>قيمة البند</th>
    <th className={styles.executionCol}>التنفيذ</th>
    <th className={styles.actionCol}>إدارة</th>
  </tr>
</thead>
<tbody>
  {numbered.map((l) => {
    if (l.kind === 'title') return (
      <tr key={l.id} className={styles.titleRow}>
        <td className="mono" style={{fontWeight:800,color:'var(--maroon-dark)'}}>{l.number}</td>
        <td colSpan={7}>
          <input
            key={`${l.id}:${l.description_ar || ''}`}
            defaultValue={l.description_ar || ''}
            disabled={!canWrite}
            className={styles.titleInput}
            onBlur={(e)=>{ if (e.target.value !== (l.description_ar || '')) upd(l.id,{description_ar:e.target.value}); }}
          />
        </td>
        <td className={styles.actionCell}>{canWrite && <button className="btn ghost" onClick={()=>setManageFor(l)}>إدارة</button>}</td>
      </tr>
    );

    const list = execsOf(l.id);
    const openAssignments = list.filter((a)=>!a.end_date);
    const current = openAssignments.find((a)=>a.start_date && a.is_active !== false)
      || openAssignments.find((a)=>!a.start_date)
      || list[list.length - 1]
      || null;
    const state = itemExecutionState(current);
    const contractor = current ? cons.find((x)=>x.id===current.contractor_id) : null;
    const bd = buds.find((x)=>x.project_item_id===l.id);
    const t = totOf(l.id);
    const ac = current ? actOf(current.id) : {};

    return (
      <tr key={l.id}>
        <td className="mono">{l.number}</td>
        <td>
          <textarea
            key={`${l.id}:${l.description_ar || ''}`}
            rows="1"
            defaultValue={l.description_ar || ''}
            disabled={!canWrite}
            className={styles.textInput}
            onBlur={(e)=>{ if (e.target.value !== (l.description_ar || '')) upd(l.id,{description_ar:e.target.value}); }}
          />
        </td>
        <td>
          <input
            key={`${l.id}:${l.unit || ''}`}
            defaultValue={l.unit || ''}
            disabled={!canWrite}
            className={styles.unitInput}
            onBlur={(e)=>{ if (e.target.value !== (l.unit || '')) upd(l.id,{unit:e.target.value}); }}
          />
        </td>
        <td><NumericField type="number" step="any" dir="ltr" value={l.contract_qty} disabled={!canWrite} aria-label="الكمية التعاقدية" onCommit={(v)=>upd(l.id,{contract_qty:v})} onInvalid={()=>setErr('الكمية غير صحيحة — أدخل رقمًا.')} className={styles.numeric}/></td>
        <td><NumericField type="number" step="0.01" dir="ltr" value={l.sell_price} disabled={!canWrite} aria-label="سعر البيع" onCommit={(v)=>upd(l.id,{sell_price:v})} onInvalid={()=>setErr('سعر البيع غير صحيح — أدخل رقمًا.')} className={styles.numeric}/></td>
        <td><NumericField type="number" step="0.01" dir="ltr" value={l.budget_cost} disabled={!canWrite} aria-label="التكلفة المخططة" onCommit={(v)=>upd(l.id,{budget_cost:v})} onInvalid={()=>setErr('التكلفة المخططة غير صحيحة — أدخل رقمًا.')} className={styles.numeric}/></td>
        <td className="num">{money(l.contract_value)}</td>
        <td>
          <div className={styles.executionSummary}>
            <div className={styles.executionTop}>
              <span className={`pill ${ITEM_EXECUTION_CLASS[state] || ''}`}>{ITEM_EXECUTION_AR[state] || state}</span>
              {bd && <span className={`pill ${bd.over_budget ? 'bad' : 'ok'}`}>هامش {(Number(bd.actual_margin||0)*100).toFixed(0)}٪</span>}
            </div>
            {current ? <>
              <div className={styles.executionName}>{contractor?.name_ar || 'منفّذ غير محدد'}{list.length>1 ? ` · ${list.length} إسنادات` : ''}</div>
              <div className={styles.executionMeta}>{MODE_AR[current.mode] || current.mode || '—'}{current.share_qty ? ` · ${Number(current.share_qty).toLocaleString('en-US')} ${l.unit || ''}` : ''}</div>
              {Number(ac.actual_output||0)>0 && <div className={styles.executionMeta}>منفذ فعليًا {Number(ac.actual_output||0).toLocaleString('en-US')} {l.unit || ''} · {money(ac.actual_cost||0)}</div>}
            </> : <div className={styles.emptyExecution}>لم يُسند منفّذ لهذا البند بعد.</div>}
            {list.length>0 && <div className={styles.executionMeta}>المتبقي {Number(t.qty_remaining||0).toLocaleString('en-US')} {l.unit || ''}</div>}
          </div>
        </td>
        <td className={styles.actionCell}>{canWrite && <button className={`btn ghost ${styles.manageButton}`} onClick={()=>setManageFor(l)}>إدارة</button>}</td>
      </tr>
    );
  })}
  {items.length === 0 && <tr><td colSpan={9}><div className="empty"><h3>لا توجد بنود</h3><p>أضف بندًا أو عنوان قسم من الشريط أعلى الجدول.</p></div></td></tr>}
</tbody>
        </table>
      </div>

      {manageFor && (
        <ConstitutionDialog
title={`${manageFor.kind === 'title' ? 'إدارة القسم' : 'إدارة البند'}: ${manageFor.description_ar || manageFor.number || 'بدون وصف'}`}
description="كل إجراءات هذا البند في مكان واحد؛ الجدول نفسه يبقى للقراءة والتحرير السريع."
onClose={()=>setManageFor(null)}
        >
<div className={styles.manageGrid}>
  {manageFor.kind === 'item' && <section className={styles.manageSection}>
    <div className={styles.manageSectionTitle}><h3>الإسناد والتنفيذ</h3><span>{execsOf(manageFor.id).length} إسناد</span></div>
    {execsOf(manageFor.id).length ? <div className={styles.assignmentList}>
      {execsOf(manageFor.id).map((a)=>{
        const c = cons.find((x)=>x.id===a.contractor_id);
        const state = itemExecutionState(a);
        return <div className={styles.assignmentCard} key={a.id}>
          <div className={styles.assignmentHead}>
            <div><strong>{c?.name_ar || 'منفّذ غير محدد'}</strong><small>{MODE_AR[a.mode] || a.mode || '—'}{a.share_qty ? ` · حصة ${Number(a.share_qty).toLocaleString('en-US')} ${manageFor.unit || ''}` : ''}</small></div>
            <span className={`pill ${ITEM_EXECUTION_CLASS[state] || ''}`}>{ITEM_EXECUTION_AR[state] || state}</span>
          </div>
          <div className={styles.assignmentActions}>
            {!a.end_date && <button className="btn ghost" onClick={()=>openDecide(manageFor,a)}>تعديل الإسناد</button>}
            {state === 'planned' && <button className="btn" onClick={()=>{setManageFor(null);setAskStart({ex:a,item:manageFor});setSDate(todayIsoInRiyadh());}}>بدء التنفيذ</button>}
            {(state === 'active' || state === 'paused') && <button className="btn" onClick={()=>openEnd(a,manageFor)}>إنهاء الإسناد</button>}
            {state === 'planned' && <button className="btn ghost" onClick={()=>requestCancelAssignment(a,manageFor)}>إلغاء الإسناد</button>}
          </div>
        </div>;
      })}
    </div> : <div className={styles.emptyExecution}>لا يوجد إسناد لهذا البند.</div>}
    {Number(totOf(manageFor.id).qty_remaining||0)>0 && <button className="btn" onClick={()=>openDecide(manageFor,null)}>+ إسناد منفّذ</button>}
  </section>}

  <section className={styles.manageSection}>
    <div className={styles.manageSectionTitle}><h3>إدارة البند</h3><span>إجراءات أقل تكرارًا</span></div>
    <div className={styles.itemActions}>
      {manageFor.kind === 'item' && <button className="btn ghost" onClick={()=>{setBudgetFor(manageFor);setManageFor(null);setDecideFor(null);setAskStart(null);setEndFor(null);}}>الميزانية</button>}
      <button className="btn ghost" onClick={()=>insertAfter(manageFor.sort_order,'item')}>إدراج بند بعده</button>
      <button className="btn ghost" onClick={()=>insertAfter(manageFor.sort_order,'title')}>إدراج عنوان بعده</button>
      <button className="btn ghost" onClick={()=>move(manageFor.id,-1)}>تحريك لأعلى</button>
      <button className="btn ghost" onClick={()=>move(manageFor.id,1)}>تحريك لأسفل</button>
      <button className={`btn ghost ${styles.danger}`} onClick={()=>requestDeleteItem(manageFor)}>حذف</button>
    </div>
  </section>
</div>
        </ConstitutionDialog>
      )}

      {askStart && (
        <ConstitutionDialog title={`بدء التنفيذ: ${askStart.item?.description_ar || 'بند'}`} description="حدد التاريخ الفعلي الذي يبدأ منه احتساب عمل هذا المنفّذ." size="compact" onClose={()=>setAskStart(null)}>
<div className="field">
  <label>تاريخ بدء التنفيذ الفعلي *</label>
  <input type="date" dir="ltr" value={sDate} onChange={(e)=>setSDate(e.target.value)} />
</div>
<div className="rowsplit" style={{marginTop:14}}>
  <button className="btn" disabled={starting === askStart.ex?.id} onClick={()=>startExec(askStart.ex,sDate)}>{starting === askStart.ex?.id ? 'جارٍ…' : 'بدء التنفيذ'}</button>
  <button className="btn ghost" onClick={()=>setAskStart(null)}>إلغاء</button>
</div>
        </ConstitutionDialog>
      )}

      {endFor && (
        <ConstitutionDialog title={`إنهاء الإسناد: ${cons.find((c)=>c.id===endFor.ex.contractor_id)?.name_ar || 'منفّذ'}`} description={endFor.item?.description_ar || ''} onClose={()=>setEndFor(null)}>
<form onSubmit={submitEnd} className={styles.dialogForm}>
  <div className="form-grid">
    <div className="field"><label>تاريخ الإنهاء *</label><input type="date" dir="ltr" required value={endF.date || ''} onChange={(e)=>setEndF({...endF,date:e.target.value})}/><span className="hint">لا يُحتسب لهذا المنفّذ عمل بعد هذا التاريخ</span></div>
    <div className="field"><label>سبب الإنهاء *</label><select value={endF.reason || 'completed'} onChange={(e)=>setEndF({...endF,reason:e.target.value})}>{Object.entries(END_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <div className="field"><label>الكمية المنفَّذة حتى التاريخ *</label><input type="number" step="any" dir="ltr" required value={endF.qty ?? ''} onChange={(e)=>setEndF({...endF,qty:e.target.value})}/></div>
    <div className="field span2"><label>ملاحظات</label><input value={endF.notes || ''} onChange={(e)=>setEndF({...endF,notes:e.target.value})}/></div>
  </div>
  <div className="rowsplit" style={{marginTop:14}}><button className="btn" type="submit">إنهاء وإقفال</button><button className="btn ghost" type="button" onClick={()=>setEndFor(null)}>إلغاء</button></div>
</form>
        </ConstitutionDialog>
      )}

      {budgetFor && (
        <ConstitutionDialog title={`ميزانية البند: ${budgetFor.description_ar || 'بند'}`} description="التخطيط المالي للبند منفصل عن صف البيانات حتى يبقى الجدول واضحًا." onClose={()=>setBudgetFor(null)}>
<ItemBudget key={budgetFor.id} item={items.find((x)=>x.id===budgetFor.id) || budgetFor} canWrite={canWrite} onClose={()=>{setBudgetFor(null);refreshCalc();}} onSaved={()=>{refreshCalc();onChange?.();}} />
        </ConstitutionDialog>
      )}

      {decideFor && (
        <ConstitutionDialog title={`${editExec ? 'تعديل إسناد' : 'إسناد منفّذ'}: ${decideFor.description_ar || 'بند'}`} description="الإسناد يحدد المنفّذ وطريقة المحاسبة وحصته من البند." onClose={()=>{setDecideFor(null);setEditExec(null);}}>
<form onSubmit={saveDecision} className={styles.dialogForm}>
  <div className="form-grid">
    <div className="field"><label>طريقة التنفيذ *</label><select value={d.mode} onChange={(e)=>setD({...d,mode:e.target.value})}>{Object.entries(MODE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <div className="field span2"><label>المنفّذ</label><select value={d.contractor_id || ''} onChange={(e)=>{const c=cons.find((x)=>x.id===e.target.value);setD({...d,contractor_id:e.target.value,worker_daily:d.worker_daily||c?.worker_daily||'',tech_daily:d.tech_daily||c?.tech_daily||''});}}><option value="">—</option>{cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></div>
    {['piecework','sublet'].includes(d.mode) && <div className="field"><label>السعر المتفق عليه للوحدة</label><input type="number" step="0.01" dir="ltr" value={d.agreed_rate ?? ''} onChange={(e)=>setD({...d,agreed_rate:e.target.value})}/><span className="hint">فئة البيع {money(decideFor.sell_price)} — الفرق هو ربحك</span></div>}
    {d.mode === 'daywork' && <><div className="field"><label>يومية العامل</label><input type="number" step="0.01" dir="ltr" value={d.worker_daily ?? ''} onChange={(e)=>setD({...d,worker_daily:e.target.value})}/></div><div className="field"><label>يومية الصنايعي</label><input type="number" step="0.01" dir="ltr" value={d.tech_daily ?? ''} onChange={(e)=>setD({...d,tech_daily:e.target.value})}/></div><div className="field"><label>متوسط الإنتاج المطلوب للفرد يوميًا</label><input type="number" step="any" dir="ltr" value={d.target_output ?? ''} onChange={(e)=>setD({...d,target_output:e.target.value})}/></div><div className="field"><label>الخصم عند عدم التحقيق</label><input type="number" step="0.01" dir="ltr" value={d.shortfall_deduction ?? ''} onChange={(e)=>setD({...d,shortfall_deduction:e.target.value})}/></div></>}
    <div className="field"><label>حصته من الكمية</label><input type="number" step="any" dir="ltr" value={d.share_qty ?? ''} onChange={(e)=>setD({...d,share_qty:e.target.value})}/><span className="hint">المتبقي {Number(totOf(decideFor.id).qty_remaining||0).toLocaleString('en-US')} {decideFor.unit||''}</span></div>
    <div className="field"><label>التكلفة الكلية المخططة</label><input type="number" step="0.01" dir="ltr" value={d.planned_cost ?? ''} onChange={(e)=>setD({...d,planned_cost:e.target.value})}/><span className="hint">ميزانية البند {money(decideFor.budget_value)} · المتبقي {money(totOf(decideFor.id).budget_remaining||0)}</span></div>
    <div className="field span2"><label>ملاحظات</label><input value={d.notes || ''} onChange={(e)=>setD({...d,notes:e.target.value})}/></div>
  </div>
  <div className="rowsplit" style={{marginTop:14}}><button className="btn" type="submit">{editExec ? 'حفظ التعديل' : 'حفظ الإسناد'}</button><button className="btn ghost" type="button" onClick={()=>{setDecideFor(null);setEditExec(null);}}>إلغاء</button></div>
</form>
        </ConstitutionDialog>
      )}

      {confirmAction && (
        <ConfirmDialog
          key={confirmAction.key}
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          busyLabel={confirmAction.busyLabel}
          danger={confirmAction.danger}
          busy={confirmBusy}
          error={confirmErr}
          onConfirm={runConfirmAction}
          onCancel={()=>{ setConfirmAction(null); setConfirmErr(''); }}
        >
          {confirmAction.body}
        </ConfirmDialog>
      )}
    </>
  );
}
