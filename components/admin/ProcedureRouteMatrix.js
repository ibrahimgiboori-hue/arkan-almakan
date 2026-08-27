'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureRouteMatrix.module.css';

const MODE_LABELS = Object.freeze({
  unclassified: 'غير مصنفة',
  none: 'لا تحتاج إجراء',
  internal: 'داخل البوابة',
  cross_portal: 'عابرة للبوابات',
});

const money = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function normalizeTargets(rows = []) {
  const byCapability = new Map();
  for (const row of rows) {
    if (!byCapability.has(row.capability_key)) byCapability.set(row.capability_key, {});
    byCapability.get(row.capability_key)[row.to_destination_key] = {
      selected: true,
      mandatory: Boolean(row.is_mandatory),
      blocking: Boolean(row.is_blocking),
    };
  }
  return byCapability;
}

function draftFromRow(row, targetsByCapability) {
  return {
    capability_key: row.capability_key,
    source_destination_key: row.source_destination_key,
    routing_mode: row.routing_mode || 'unclassified',
    requires_followup: Boolean(row.requires_followup),
    internal_upward_required: row.internal_upward_required !== false,
    financial_effect: Boolean(row.financial_effect),
    financial_review_required: Boolean(row.financial_review_required),
    allow_additional_requirements: row.allow_additional_requirements !== false,
    allow_specific_user: row.allow_specific_user !== false,
    default_sla_hours: row.default_sla_hours || '',
    notes: row.notes || '',
    targets: targetsByCapability.get(row.capability_key) || {},
  };
}

export default function ProcedureRouteMatrix() {
  const [rows, setRows] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentScan, setAgentScan] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('routing');

  const load = useCallback(async ({ scan = false } = {}) => {
    setLoading(true); setError('');
    let scanQ = null;
    if (scan) {
      setAgentBusy(true);
      scanQ = await supabase.rpc('fn_procedure_auto_discover_sources');
      if (!scanQ.error) setAgentScan(scanQ.data || null);
    }
    const [matrixQ, destQ, targetsQ, agentQ] = await Promise.all([
      supabase.rpc('fn_admin_procedure_route_matrix'),
      supabase.from('procedure_destinations').select('destination_key,label_ar,destination_type,portal_key,is_active,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('procedure_route_targets').select('capability_key,to_destination_key,is_mandatory,is_blocking,is_active').eq('is_active', true),
      supabase.rpc('fn_procedure_agent_status'),
    ]);
    setAgentBusy(false);
    if (!agentQ.error) setAgentStatus(agentQ.data || null);
    const firstError = scanQ?.error || matrixQ.error || destQ.error || targetsQ.error;
    if (firstError) {
      setError(firstError.message || 'تعذر تحميل دستور حركة المعاملات.');
      setRows([]); setDestinations([]); setDrafts({}); setLoading(false); return;
    }
    const matrix = matrixQ.data || [];
    const targetMap = normalizeTargets(targetsQ.data || []);
    setRows(matrix);
    setDestinations(destQ.data || []);
    setDrafts(Object.fromEntries(matrix.map(row => [row.capability_key, draftFromRow(row, targetMap)])));
    setLoading(false);
  }, []);

  useEffect(() => { load({ scan: true }); }, [load]);

  const modules = useMemo(() => {
    const map = new Map();
    rows.forEach(row => map.set(row.module_key, row.module_label_ar));
    return [...map.entries()];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      if (moduleFilter !== 'all' && row.module_key !== moduleFilter) return false;
      if (statusFilter === 'routing' && !row.routing_candidate) return false;
      if (statusFilter === 'unclassified' && row.classification_status !== 'غير مصنفة') return false;
      if (statusFilter === 'classified' && row.classification_status === 'غير مصنفة') return false;
      if (!q) return true;
      return `${row.module_label_ar} ${row.resource_label_ar} ${row.action_label_ar} ${row.capability_key}`.toLowerCase().includes(q);
    });
  }, [rows, query, moduleFilter, statusFilter]);

  const unclassifiedCount = useMemo(() => rows.filter(row => row.routing_candidate && row.classification_status === 'غير مصنفة').length, [rows]);

  function patch(capabilityKey, patchValue) {
    setDrafts(prev => ({ ...prev, [capabilityKey]: { ...prev[capabilityKey], ...patchValue } }));
  }

  function patchTarget(capabilityKey, destinationKey, patchValue) {
    setDrafts(prev => {
      const current = prev[capabilityKey];
      const currentTarget = current.targets?.[destinationKey] || { selected: false, mandatory: false, blocking: true };
      return {
        ...prev,
        [capabilityKey]: {
          ...current,
          targets: { ...current.targets, [destinationKey]: { ...currentTarget, ...patchValue } },
        },
      };
    });
  }

  function setFinancial(capabilityKey, checked) {
    setDrafts(prev => {
      const current = prev[capabilityKey];
      const financeTarget = current.targets?.finance || { selected: false, mandatory: false, blocking: true };
      return {
        ...prev,
        [capabilityKey]: {
          ...current,
          financial_effect: checked,
          financial_review_required: checked ? true : current.financial_review_required,
          default_sla_hours: checked && !current.default_sla_hours ? 24 : current.default_sla_hours,
          routing_mode: checked && current.routing_mode === 'unclassified' ? 'cross_portal' : current.routing_mode,
          requires_followup: checked ? true : current.requires_followup,
          targets: checked ? {
            ...current.targets,
            finance: { ...financeTarget, selected: true, mandatory: true, blocking: true },
          } : current.targets,
        },
      };
    });
  }

  async function save(row) {
    const draft = drafts[row.capability_key];
    if (!draft) return;
    const selectedTargets = Object.entries(draft.targets || {}).filter(([, value]) => value?.selected);
    if (draft.routing_mode === 'cross_portal' && draft.requires_followup && selectedTargets.length === 0) {
      setError('اختر جهة واحدة على الأقل ضمن مجال حركة العملية.'); return;
    }
    setBusyKey(row.capability_key); setError(''); setMessage('');
    const session = (await supabase.auth.getSession()).data.session;
    const policyPayload = {
      capability_key: row.capability_key,
      source_destination_key: draft.source_destination_key,
      routing_mode: draft.routing_mode,
      requires_followup: draft.routing_mode === 'none' ? false : Boolean(draft.requires_followup),
      internal_upward_required: Boolean(draft.internal_upward_required),
      financial_effect: Boolean(draft.financial_effect),
      financial_review_required: Boolean(draft.financial_review_required),
      allow_additional_requirements: Boolean(draft.allow_additional_requirements),
      allow_specific_user: Boolean(draft.allow_specific_user),
      default_sla_hours: draft.default_sla_hours ? Number(draft.default_sla_hours) : null,
      notes: draft.notes.trim() || null,
      updated_by: session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const policyQ = await supabase.from('procedure_route_policies').upsert(policyPayload, { onConflict: 'capability_key' });
    if (policyQ.error) { setError(policyQ.error.message); setBusyKey(''); return; }

    const deleteQ = await supabase.from('procedure_route_targets').delete().eq('capability_key', row.capability_key);
    if (deleteQ.error) { setError(deleteQ.error.message); setBusyKey(''); return; }

    if (selectedTargets.length) {
      const inserts = selectedTargets.map(([destinationKey, value], index) => ({
        capability_key: row.capability_key,
        from_destination_key: draft.source_destination_key,
        to_destination_key: destinationKey,
        action_type: 'review',
        is_mandatory: Boolean(value.mandatory),
        is_blocking: value.blocking !== false,
        allow_specific_user: Boolean(draft.allow_specific_user),
        sla_hours: draft.default_sla_hours ? Number(draft.default_sla_hours) : null,
        sort_order: (index + 1) * 10,
        is_active: true,
      }));
      const insertQ = await supabase.from('procedure_route_targets').insert(inserts);
      if (insertQ.error) { setError(insertQ.error.message); setBusyKey(''); return; }
    }
    setMessage(`تم حفظ دستور حركة: ${row.resource_label_ar} — ${row.action_label_ar}.`);
    await load();
    setBusyKey('');
  }

  if (loading && !agentStatus) return <div className={styles.state}>جارٍ حصر عمليات البرنامج وزرع مستشعرات الإجراء…</div>;

  return <div className={styles.root} dir="rtl">
    {agentStatus ? <div style={{border:'1px solid var(--ui-border,#ddd)',borderRadius:12,padding:14,marginBottom:14,background:'var(--ui-paper,#fff)',display:'grid',gap:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div><strong style={{display:'block',fontSize:16}}>عامل الإجراءات التلقائي</strong><small>يفحص مصادر العمليات ويزرع المستشعر دون تعديل بيانات التشغيل الأصلية.</small></div>
        <button type="button" disabled={agentBusy} onClick={() => load({ scan: true })}>{agentBusy ? 'جارٍ الفحص…' : 'فحص البرنامج الآن'}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8}}>
        <div><strong>{agentStatus.sources ?? 0}</strong><small style={{display:'block'}}>مصدر عملية مكتشف</small></div>
        <div><strong>{agentStatus.instrumented ?? 0}</strong><small style={{display:'block'}}>مستشعر مزروع</small></div>
        <div><strong>{agentStatus.financial_sources ?? 0}</strong><small style={{display:'block'}}>مصدر ذو أثر مالي</small></div>
        <div><strong>{agentStatus.open_transactions ?? 0}</strong><small style={{display:'block'}}>معاملة تحت المعالجة</small></div>
        <div><strong>{money.format(Number(agentStatus.settled_total || 0))} ر.س</strong><small style={{display:'block'}}>تمت تسويته</small></div>
        <div><strong>{money.format(Number(agentStatus.outstanding_total || 0))} ر.س</strong><small style={{display:'block'}}>لم تتم تسويته</small></div>
      </div>
      <div style={{fontSize:12}}>
        {agentStatus.unmapped > 0 ? <span>يوجد {agentStatus.unmapped} مصادر مكتشفة لم تُربط بصلاحية بعد؛ تركها العامل للمراجعة بدل اختراع مسار لها.</span> : <span>كل المصادر المكتشفة مرتبطة بمسار معروف.</span>}
        {agentScan?.backfilled ? <span> · آخر فحص راجع {agentScan.backfilled} سجلًا قائمًا.</span> : null}
      </div>
    </div> : null}

    <div className={styles.toolbar}>
      <div className={styles.summary}>
        <strong>{rows.length}</strong><span>عملية/صلاحية مسجلة</span>
        <strong>{unclassifiedCount}</strong><span>عملية إجرائية غير مصنفة</span>
      </div>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث بالعملية أو الصلاحية…" />
      <select value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}>
        <option value="all">كل البوابات</option>
        {modules.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
        <option value="routing">العمليات الإجرائية</option>
        <option value="unclassified">غير المصنفة فقط</option>
        <option value="classified">المصنفة فقط</option>
        <option value="all">كل العمليات بما فيها العرض</option>
      </select>
      <button type="button" onClick={() => load()}>تحديث الحصر</button>
    </div>

    {error ? <div className={styles.error}>{error}</div> : null}
    {message ? <div className={styles.success}>{message}</div> : null}

    <div className={styles.tableWrap}>
      <table className={styles.matrix}>
        <thead><tr>
          <th>العملية</th><th>البوابة</th><th>الفعل</th><th>تحتاج إجراء؟</th><th>نمط الحركة</th>
          <th>صعود داخلي</th><th>أثر مالي</th><th>مجال الجهات</th><th>مهلة</th><th>الحالة</th><th>ملاحظة / حفظ</th>
        </tr></thead>
        <tbody>{visibleRows.map(row => {
          const draft = drafts[row.capability_key] || draftFromRow(row, new Map());
          const selectedCount = Object.values(draft.targets || {}).filter(value => value?.selected).length;
          const isUnclassified = draft.routing_mode === 'unclassified';
          return <tr key={row.capability_key} className={isUnclassified && row.routing_candidate ? styles.unclassified : ''}>
            <td className={styles.operation}><strong>{row.resource_label_ar}</strong><small>{row.capability_key}</small></td>
            <td><span className={styles.portal}>{row.module_label_ar}</span></td>
            <td><strong>{row.action_label_ar}</strong><small>رتبة {row.workflow_rank || 0}</small></td>
            <td><label className={styles.toggle}><input type="checkbox" checked={draft.requires_followup} onChange={e => patch(row.capability_key, { requires_followup: e.target.checked, routing_mode: e.target.checked && draft.routing_mode === 'unclassified' ? 'internal' : draft.routing_mode })}/><span>{draft.requires_followup ? 'نعم' : 'لا'}</span></label></td>
            <td><select value={draft.routing_mode} onChange={e => patch(row.capability_key, { routing_mode: e.target.value, requires_followup: e.target.value === 'none' ? false : draft.requires_followup })}>{Object.entries(MODE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
            <td><label className={styles.toggle}><input type="checkbox" checked={draft.internal_upward_required} onChange={e => patch(row.capability_key, { internal_upward_required: e.target.checked })}/><span>{draft.internal_upward_required ? 'للأعلى' : 'لا'}</span></label></td>
            <td><label className={styles.moneyToggle}><input type="checkbox" checked={draft.financial_effect} onChange={e => setFinancial(row.capability_key, e.target.checked)}/><span>{draft.financial_effect ? 'مالي' : '—'}</span></label></td>
            <td className={styles.destinations}>
              <details>
                <summary>{selectedCount ? `${selectedCount} جهة` : 'اختر الجهات'}</summary>
                <div className={styles.destinationMenu}>
                  {destinations.filter(destination => destination.destination_key !== draft.source_destination_key).map(destination => {
                    const target = draft.targets?.[destination.destination_key] || {};
                    return <div className={styles.destinationRow} key={destination.destination_key}>
                      <label><input type="checkbox" checked={Boolean(target.selected)} onChange={e => patchTarget(row.capability_key, destination.destination_key, { selected: e.target.checked, mandatory: e.target.checked ? Boolean(target.mandatory) : false })}/><span>{destination.label_ar}</span></label>
                      {target.selected ? <label className={styles.mandatory}><input type="checkbox" checked={Boolean(target.mandatory)} onChange={e => patchTarget(row.capability_key, destination.destination_key, { mandatory: e.target.checked, blocking: e.target.checked ? true : target.blocking })}/><span>إلزامية</span></label> : null}
                    </div>;
                  })}
                </div>
              </details>
            </td>
            <td><div className={styles.sla}><input type="number" min="1" max="8760" value={draft.default_sla_hours} onChange={e => patch(row.capability_key, { default_sla_hours: e.target.value })}/><span>ساعة</span></div></td>
            <td><span className={isUnclassified ? styles.statusPending : styles.statusReady}>{isUnclassified ? 'غير مصنفة' : MODE_LABELS[draft.routing_mode]}</span></td>
            <td className={styles.saveCell}><input value={draft.notes} onChange={e => patch(row.capability_key, { notes: e.target.value })} placeholder="ملاحظة مختصرة"/><button type="button" disabled={busyKey === row.capability_key} onClick={() => save(row)}>{busyKey === row.capability_key ? 'جارٍ…' : 'حفظ'}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!visibleRows.length ? <div className={styles.state}>لا توجد عمليات مطابقة للفلتر الحالي.</div> : null}
  </div>;
}
