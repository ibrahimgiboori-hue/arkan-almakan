'use client';
import { useEffect, useState } from 'react';
import { money, todayIsoInRiyadh } from '@/lib/format';
import { ITEM_EXECUTION_AR, ITEM_EXECUTION_CLASS, MODE_AR, itemExecutionState } from '@/lib/projects';
import { projectScopeService } from '@/lib/application/project-scope-service';
import {
  PROJECT_SCOPE_END_REASONS,
  numberProjectScopeItems,
  projectScopeAssignmentsOf,
  projectScopeCurrentAssignment,
  projectScopeDeleteImpact,
  projectScopePatchNeedsCalculation,
  summarizeProjectScope,
} from '@/lib/project-scope.mjs';
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
  const [starting, setStarting] = useState(null);
  const [askStart, setAskStart] = useState(null);
  const [sDate, setSDate] = useState('');
  const [d, setD] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const workspace = await projectScopeService.loadWorkspace({ projectId });
      setItems(workspace.items);
      setExecs(workspace.executions);
      setCons(workspace.contractors);
      setBuds(workspace.budgets);
      setTots(workspace.totals);
      setActs(workspace.actuals);
      onChange?.();
    } catch (error) {
      setErr('تعذّر تحميل نطاق المشروع: ' + (error?.message || error));
      setItems([]);
      setExecs([]);
      setCons([]);
      setBuds([]);
      setTots([]);
      setActs([]);
    }
  }

  useEffect(() => { load(); }, [projectId]);
  useLiveRefresh(load, ['scope','budget','exec','all']);

  const execsOf = (id) => projectScopeAssignmentsOf(execs,id);
  const totOf = (id) => tots.find((x) => x.project_item_id === id) || {};
  const actOf = (execId) => acts.find((x) => x.exec_id === execId) || {};

  async function addLine(kind) {
    setErr('');
    try {
      await projectScopeService.addLine({ projectId, kind });
      await load();
      notifyChange('scope');
    } catch (error) {
      setErr('تعذّر الإضافة: ' + (error?.message || error));
    }
  }

  async function insertAfter(afterOrder, kind) {
    setErr('');
    try {
      await projectScopeService.insertAfter({ projectId, afterOrder, kind });
      await load();
      notifyChange('scope');
    } catch (error) {
      setErr('تعذّر الإدراج: ' + (error?.message || error));
    }
  }

  async function upd(id, fields) {
    setErr('');
    setItems((current) => (current || []).map((x) => x.id === id ? { ...x, ...fields } : x));
    try {
      const saved = await projectScopeService.updateItem({ itemId:id, fields });
      setItems((current) => (current || []).map((x) => x.id === id ? { ...x, ...saved } : x));
      if (projectScopePatchNeedsCalculation(fields)) await refreshCalc();
      notifyChange('scope');
      onChange?.();
    } catch (error) {
      setErr('تعذّر الحفظ: ' + (error?.message || error));
      await load();
    }
  }

  async function refreshCalc() {
    try {
      const calc = await projectScopeService.loadCalculations({ projectId });
      setItems(calc.items || []);
      setBuds(calc.budgets || []);
    } catch (error) {
      setErr('تعذّر تحديث حسابات البنود: ' + (error?.message || error));
    }
  }

  async function del(id) {
    const result = await projectScopeService.deleteItem({ itemId:id });
    setMsg(result.cancelledPlannedAssignments > 0
      ? `حُذف البند وأُلغي معه ${result.cancelledPlannedAssignments} إسناد مخطط.`
      : 'حُذف البند.');
    setManageFor(null);
    await load();
    notifyChange('scope');
  }

  function requestDeleteItem(item) {
    setConfirmErr('');
    const impact = projectScopeDeleteImpact(execs,item.id);
    setConfirmAction({
      key: `delete-item-${item.id}`,
      title: `${item.kind === 'title' ? 'حذف القسم' : 'حذف البند'}: ${item.description_ar || item.number || 'بدون وصف'}`,
      description: 'الحذف نهائي ولا يمكن التراجع عنه.',
      confirmLabel: item.kind === 'title' ? 'حذف القسم' : 'حذف البند',
      busyLabel: 'جارٍ الحذف…',
      danger: true,
      body: (
        <div style={{lineHeight:1.7}}>
          <p style={{margin:0}}>
            الحذف نهائي. الإسناد الذي بدأ تنفيذه فعلًا لا يُحذف — يبقى تاريخه ويُنهى.
          </p>
          {impact.plannedCount > 0 && (
            <p style={{margin:'8px 0 0'}}>
              سيُلغى معه {impact.plannedCount} إسناد مخطط لم يبدأ بعد.
            </p>
          )}
          {impact.startedCount > 0 && (
            <p style={{margin:'8px 0 0'}}>
              يرتبط بالبند {impact.startedCount} إسناد بدأ تنفيذه — سيُرفض الحذف حتى يُنهى.
            </p>
          )}
        </div>
      ),
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
    } catch (error) {
      setConfirmErr(error?.message || String(error));
    }
    setConfirmBusy(false);
  }

  async function move(id, dir) {
    setErr('');
    try {
      const result = await projectScopeService.moveItem({ projectId, itemId:id, direction:dir });
      if (result.moved) {
        await load();
        notifyChange('scope');
      }
    } catch (error) {
      setErr('تعذّر تحريك البند: ' + (error?.message || error));
      await load();
    }
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

  async function saveDecision(e) {
    e.preventDefault(); setErr('');
    try {
      await projectScopeService.saveExecutionAssignment({
        itemId:decideFor.id,
        form:d,
        executionId:editExec?.id || null,
      });
      setMsg(editExec ? 'حُدّث الإسناد' : 'أُضيف الإسناد');
      setDecideFor(null); setEditExec(null);
      await load(); notifyChange('exec'); onChange?.();
    } catch (error) {
      setErr('تعذّر الحفظ: ' + (error?.message || error));
    }
  }

  async function startExec(ex, date) {
    setStarting(ex.id); setErr(''); setMsg('');
    try {
      const { result } = await projectScopeService.startExecution({ executionId:ex.id, date });
      const parts = ['بدأ التنفيذ'];
      if (result?.created_project_contractor) parts.push('وتم ربط المقاول بالمشروع');
      else if (result?.reactivated_project_contractor) parts.push('وأُعيد تفعيل ارتباط المقاول بالمشروع');
      setMsg(parts.join(' ') + '.');
      setAskStart(null);
      await load(); notifyChange('exec'); onChange?.();
    } catch (error) {
      setErr(error?.message || String(error));
    }
    setStarting(null);
  }

  function openEnd(ex, item) {
    setManageFor(null); setDecideFor(null); setAskStart(null); setBudgetFor(null);
    setEndFor({ ex, item });
    setEndF({ date: todayIsoInRiyadh(), reason: 'completed', qty: '' });
    setErr(''); setMsg('');
  }

  async function submitEnd(e) {
    e.preventDefault(); setErr('');
    try {
      await projectScopeService.endExecution({ executionId:endFor.ex.id, form:endF });
      setMsg('أُقفل الإسناد وتحرّرت الكمية المتبقية.');
      setEndFor(null);
      await load(); notifyChange('exec'); onChange?.();
    } catch (error) {
      setErr(error?.message || String(error));
    }
  }

  async function delDecision(ex) {
    if (!ex) return;
    await projectScopeService.cancelExecution({ executionId:ex.id });
    setMsg('أُلغي الإسناد المخطط.');
    setManageFor(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  if (!items) return <div className="empty">جارٍ التحميل…</div>;

  const numbered = numberProjectScopeItems(items);
  const summary = summarizeProjectScope(items,execs);
  const totalContract = summary.totalContract;
  const totalBudget = summary.totalBudget;
  const noDecision = summary.noDecision;

  return (
    <div data-project-scope-workspace="engineered-v1">
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
    const current = projectScopeCurrentAssignment(execs,l.id);
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
    <div className="field"><label>سبب الإنهاء *</label><select value={endF.reason || 'completed'} onChange={(e)=>setEndF({...endF,reason:e.target.value})}>{Object.entries(PROJECT_SCOPE_END_REASONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
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
    </div>
  );
}
