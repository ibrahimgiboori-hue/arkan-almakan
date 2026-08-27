'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureRouteMatrix.module.css';

const ROUTE_LABELS = Object.freeze({
  undecided:'غير محدد', none:'لا مسار', general:'مسار عام', special:'مسار خاص',
});
const INTENT_LABELS = Object.freeze({
  choose:'يختار عند الإرسال', request:'طلب / طلب إجراء', approval:'طلب اعتماد', assignment:'تكليف',
});
const SCOPE_LABELS = Object.freeze({
  both:'داخل البوابة أو خارجها', same_portal:'داخل البوابة فقط', cross_portal:'عبر البوابات فقط',
});
const ROLE_LABELS = Object.freeze({
  origin:'منشأ معاملة', decision:'مرحلة قرار', mutation:'تعديل مؤثر', execution:'تنفيذ / تسوية', support:'إجراء مساند', output:'عرض / إخراج',
});
const EFFECT_META = Object.freeze([
  ['temporal_effect','زمني','مدة أو تاريخ مؤثر'],
  ['financial_effect','مالي','أثر مالي'],
  ['legal_effect','قانوني','أثر قانوني أو تعاقدي'],
  ['printable_output','مستند','قابل للطباعة أو الإصدار'],
]);

function normalizeTargets(rows = []) {
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.capability_key)) map.set(row.capability_key, {});
    map.get(row.capability_key)[row.to_destination_key] = {
      selected:true,
      mandatory:Boolean(row.is_mandatory),
      blocking:row.is_blocking !== false,
    };
  });
  return map;
}

function draftFromRow(row, targetMap) {
  return {
    route_template:row.route_template || 'undecided',
    default_intent:row.default_intent || 'choose',
    allow_request:row.allow_request !== false,
    allow_approval:row.allow_approval !== false,
    allow_assignment:Boolean(row.allow_assignment),
    general_scope:row.general_scope || 'both',
    default_sla_hours:row.default_sla_hours ?? '',
    notes:row.notes || '',
    source_destination_key:row.source_destination_key,
    targets:targetMap.get(row.capability_key) || {},
  };
}

function EffectChips({row}) {
  const active = EFFECT_META.filter(([key]) => Boolean(row[key]));
  if (!active.length) return <span className={styles.effectNone}>بسيطة / تحتاج تصنيف</span>;
  return <div className={styles.effects}>{active.map(([key,label,title]) => <span key={key} title={title}>{label}</span>)}</div>;
}

function MovementRules({rules}) {
  if (!rules.length) return null;
  return <section className={styles.rulesBox}>
    <div className={styles.blockHead}>
      <div><span>قواعد الاتجاه</span><h3>دستور الطلب والتكليف</h3></div>
      <p>هذه قواعد عامة للحركة، أما كل عملية فتحدد أدناه هل تستخدم مسارًا عامًا أو خاصًا.</p>
    </div>
    <div className={styles.rulesGrid}>{rules.map(rule => <article key={rule.movement_kind}>
      <strong>{rule.label_ar}</strong>
      <p>{rule.description_ar}</p>
      <small>{rule.requires_target_portal_gate ? 'عبر البوابات: يمر بمسؤول البوابة الهدف' : 'لا توجد بوابة وسيطة إلزامية لهذا النوع'}</small>
    </article>)}</div>
  </section>;
}

export default function ProcedureRouteMatrix() {
  const [rows,setRows] = useState([]);
  const [destinations,setDestinations] = useState([]);
  const [drafts,setDrafts] = useState({});
  const [rules,setRules] = useState([]);
  const [unmapped,setUnmapped] = useState([]);
  const [unmappedChoice,setUnmappedChoice] = useState({});
  const [agentStatus,setAgentStatus] = useState(null);
  const [agentScan,setAgentScan] = useState(null);
  const [loading,setLoading] = useState(true);
  const [agentBusy,setAgentBusy] = useState(false);
  const [busyKey,setBusyKey] = useState('');
  const [linkBusy,setLinkBusy] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [query,setQuery] = useState('');
  const [moduleFilter,setModuleFilter] = useState('all');
  const [routeFilter,setRouteFilter] = useState('all');
  const [coreFilter,setCoreFilter] = useState('all');

  const load = useCallback(async ({scan=false}={}) => {
    setLoading(true); setError('');
    let scanQ = null;
    if (scan) {
      setAgentBusy(true);
      scanQ = await supabase.rpc('fn_procedure_auto_discover_sources');
      if (!scanQ.error) setAgentScan(scanQ.data || null);
    }
    const [matrixQ,destQ,targetsQ,statusQ,rulesQ,unmappedQ] = await Promise.all([
      supabase.rpc('fn_admin_transaction_constitution'),
      supabase.from('procedure_destinations').select('destination_key,label_ar,destination_type,portal_key,is_active,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('procedure_route_targets').select('capability_key,to_destination_key,is_mandatory,is_blocking,is_active').eq('is_active',true),
      supabase.rpc('fn_procedure_agent_status'),
      supabase.from('procedure_movement_rules').select('movement_kind,label_ar,same_portal_direction,cross_portal_rule,requires_target_portal_gate,description_ar,sort_order').eq('is_active',true).order('sort_order'),
      supabase.rpc('fn_admin_unmapped_transaction_sources'),
    ]);
    setAgentBusy(false);
    const firstError = scanQ?.error || matrixQ.error || destQ.error || targetsQ.error || statusQ.error || rulesQ.error || unmappedQ.error;
    if (firstError) {
      setError(firstError.message || 'تعذر تحميل دستور حركة المعاملات.');
      setLoading(false); return;
    }
    const matrix = matrixQ.data || [];
    const targetMap = normalizeTargets(targetsQ.data || []);
    setRows(matrix);
    setDestinations(destQ.data || []);
    setRules(rulesQ.data || []);
    setUnmapped(unmappedQ.data || []);
    setAgentStatus(statusQ.data || null);
    setDrafts(Object.fromEntries(matrix.map(row => [row.capability_key,draftFromRow(row,targetMap)])));
    setLoading(false);
  },[]);

  useEffect(() => { load(); },[load]);

  const modules = useMemo(() => {
    const m = new Map();
    rows.forEach(row => m.set(row.module_key,row.module_label_ar));
    return [...m.entries()];
  },[rows]);

  const linkableOperations = useMemo(() => rows.filter(row => !['output','decision'].includes(row.operation_role)),[rows]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      if (moduleFilter !== 'all' && row.module_key !== moduleFilter) return false;
      if (routeFilter !== 'all' && row.route_template !== routeFilter) return false;
      if (coreFilter === 'core' && !row.central_candidate) return false;
      if (coreFilter === 'hook-missing' && !String(row.hook_status || '').includes('غير مربوطة') && !String(row.hook_status || '').includes('تحتاج')) return false;
      if (coreFilter === 'decision' && row.operation_role !== 'decision') return false;
      if (!q) return true;
      return `${row.module_label_ar} ${row.resource_label_ar} ${row.action_label_ar} ${row.capability_key} ${(row.source_names||[]).join(' ')}`.toLowerCase().includes(q);
    });
  },[rows,moduleFilter,routeFilter,coreFilter,query]);

  const stats = useMemo(() => ({
    operations:rows.length,
    core:rows.filter(row => row.central_candidate).length,
    undecided:rows.filter(row => row.route_template === 'undecided' && row.operation_role !== 'output').length,
    hooked:rows.filter(row => row.hook_status === 'الصنارة مزروعة').length,
  }),[rows]);

  function patch(key,value){ setDrafts(prev => ({...prev,[key]:{...prev[key],...value}})); }
  function patchTarget(key,destination,value){
    setDrafts(prev => {
      const current = prev[key];
      const target = current.targets?.[destination] || {selected:false,mandatory:false,blocking:true};
      return {...prev,[key]:{...current,targets:{...current.targets,[destination]:{...target,...value}}}};
    });
  }

  async function save(row){
    const d = drafts[row.capability_key];
    if (!d) return;
    setBusyKey(row.capability_key); setError(''); setMessage('');
    const policyQ = await supabase.rpc('fn_admin_save_transaction_policy',{
      p_capability_key:row.capability_key,
      p_route_template:d.route_template,
      p_default_intent:d.default_intent,
      p_allow_request:Boolean(d.allow_request),
      p_allow_approval:Boolean(d.allow_approval),
      p_allow_assignment:Boolean(d.allow_assignment),
      p_general_scope:d.general_scope,
      p_default_sla_hours:d.default_sla_hours === '' ? null : Number(d.default_sla_hours),
      p_notes:d.notes.trim() || null,
    });
    if (policyQ.error){ setError(policyQ.error.message); setBusyKey(''); return; }

    if (d.route_template === 'special') {
      const selected = Object.entries(d.targets || {}).filter(([,v]) => v?.selected);
      const deleteQ = await supabase.from('procedure_route_targets').delete().eq('capability_key',row.capability_key);
      if (deleteQ.error){ setError(deleteQ.error.message); setBusyKey(''); return; }
      if (selected.length) {
        const inserts = selected.map(([destination,v],index) => ({
          capability_key:row.capability_key,
          from_destination_key:d.source_destination_key,
          to_destination_key:destination,
          action_type:'review',
          is_mandatory:Boolean(v.mandatory),
          is_blocking:v.blocking !== false,
          allow_specific_user:true,
          sla_hours:d.default_sla_hours === '' ? null : Number(d.default_sla_hours),
          sort_order:(index+1)*10,
          is_active:true,
        }));
        const insertQ = await supabase.from('procedure_route_targets').insert(inserts);
        if (insertQ.error){ setError(insertQ.error.message); setBusyKey(''); return; }
      }
    }
    if (d.route_template !== 'special') {
      await supabase.from('procedure_route_targets').delete().eq('capability_key',row.capability_key);
    }
    setMessage(`حُفظ قرار المسار: ${row.resource_label_ar} — ${row.action_label_ar}`);
    await load();
    setBusyKey('');
  }

  async function linkSource(source){
    const cap = unmappedChoice[source.source_key];
    if (!cap){ setError('اختر العملية التي ينتمي إليها هذا المصدر أولاً.'); return; }
    setLinkBusy(source.source_key); setError(''); setMessage('');
    const {error:linkError} = await supabase.rpc('fn_admin_link_transaction_source',{p_source_key:source.source_key,p_capability_key:cap});
    if (linkError){ setError(linkError.message); setLinkBusy(''); return; }
    setMessage(`تم ربط ${source.relation_name} بالعملية المختارة.`);
    await load();
    setLinkBusy('');
  }

  if (loading && !rows.length) return <div className={styles.state}>جارٍ تجهيز دستور المعاملات والصنارات…</div>;

  return <div className={styles.root} dir="rtl">
    <section className={styles.agentBox}>
      <div className={styles.agentHead}>
        <div><span>القلب المركزي</span><h3>الصنارة ومصادر المعاملات</h3><p>الاكتشاف يلتقط المعاملة فقط؛ لا يقرر اعتمادها ولا يرسلها تلقائيًا لأي بوابة.</p></div>
        <button type="button" disabled={agentBusy} onClick={() => load({scan:true})}>{agentBusy?'جارٍ الفحص…':'فحص وزرع الصنارات'}</button>
      </div>
      <div className={styles.statGrid}>
        <div><strong>{agentStatus?.central_candidates ?? 0}</strong><span>مصدر يدخل القلب</span></div>
        <div><strong>{agentStatus?.instrumented ?? 0}</strong><span>صنارة مزروعة</span></div>
        <div><strong>{agentStatus?.temporal_sources ?? 0}</strong><span>أثر زمني</span></div>
        <div><strong>{agentStatus?.financial_sources ?? 0}</strong><span>أثر مالي</span></div>
        <div><strong>{agentStatus?.legal_sources ?? 0}</strong><span>أثر قانوني</span></div>
        <div><strong>{agentStatus?.printable_sources ?? 0}</strong><span>مصدر قابل للطباعة</span></div>
      </div>
      <small>{agentScan?.backfilled ? `آخر فحص راجع ${agentScan.backfilled} سجلًا قائمًا. ` : ''}المعاملة المجمعة تُلتقط كوعاء واحد، بينما السجلات اليومية تبقى أدلة تشغيلية داخله.</small>
    </section>

    <MovementRules rules={rules}/>

    <section className={styles.constitutionBox}>
      <div className={styles.blockHead}>
        <div><span>دستور حركة المعاملات</span><h3>كل العمليات الممكنة في البرنامج</h3></div>
        <p>أنت تحدد فقط هل للعملية مسار، وهل المسار عام أم خاص. نوع الأثر والصنارة لا يفرضان اعتمادًا من تلقاء نفسيهما.</p>
      </div>
      <div className={styles.summaryStrip}>
        <div><strong>{stats.operations}</strong><span>عملية معرفة</span></div>
        <div><strong>{stats.core}</strong><span>مرتبطة بمصدر مؤثر</span></div>
        <div><strong>{stats.hooked}</strong><span>صنارة مكتملة</span></div>
        <div><strong>{stats.undecided}</strong><span>بانتظار قرارك</span></div>
        <div><strong>{unmapped.length}</strong><span>مصدر يحتاج ربطًا</span></div>
      </div>
      <div className={styles.toolbar}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم المعاملة أو المصدر…"/>
        <select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="all">كل البوابات</option>{modules.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <select value={routeFilter} onChange={e=>setRouteFilter(e.target.value)}><option value="all">كل قرارات المسار</option>{Object.entries(ROUTE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <select value={coreFilter} onChange={e=>setCoreFilter(e.target.value)}>
          <option value="all">كل العمليات</option><option value="core">التي دخلت القلب</option><option value="hook-missing">صنارة ناقصة</option><option value="decision">مراحل القرار</option>
        </select>
        <button type="button" onClick={()=>load()}>تحديث</button>
      </div>
      {error?<div className={styles.error}>{error}</div>:null}
      {message?<div className={styles.success}>{message}</div>:null}

      <div className={styles.tableWrap}>
        <table className={styles.matrix}>
          <thead><tr><th>المعاملة</th><th>الأثر</th><th>الصنارة</th><th>قرار المسار</th><th>نوع الحركة</th><th>المسموح</th><th>المجال / الجهات</th><th>مهلة</th><th>ملاحظة</th><th></th></tr></thead>
          <tbody>{visibleRows.map(row=>{
            const d = drafts[row.capability_key] || draftFromRow(row,new Map());
            const selectedCount = Object.values(d.targets||{}).filter(v=>v?.selected).length;
            return <tr key={row.capability_key} className={d.route_template==='undecided' && row.operation_role!=='output' ? styles.unclassified:''}>
              <td className={styles.operation}>
                <strong>{row.resource_label_ar} — {row.action_label_ar}</strong>
                <span className={styles.portal}>{row.module_label_ar}</span>
                <small>{ROLE_LABELS[row.operation_role]||row.operation_role} · مخاطرة {row.risk_level ?? 0}</small>
                {row.source_names?.length?<small>المصدر: {row.source_names.join('، ')}</small>:null}
              </td>
              <td><EffectChips row={row}/>{row.aggregate_source?<small className={styles.aggregateTag}>مجمعة / دورية</small>:null}</td>
              <td><span className={row.hook_status==='الصنارة مزروعة'?styles.hookReady:row.operation_role==='decision'?styles.hookStage:styles.hookPending}>{row.hook_status}</span>{row.source_count>0?<small>{row.instrumented_count}/{row.source_count} مصدر</small>:null}</td>
              <td><select value={d.route_template} onChange={e=>patch(row.capability_key,{route_template:e.target.value})}>{Object.entries(ROUTE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
              <td><select disabled={d.route_template==='none'||d.route_template==='undecided'} value={d.default_intent} onChange={e=>patch(row.capability_key,{default_intent:e.target.value})}>{Object.entries(INTENT_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
              <td className={styles.allowedKinds}>
                <label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={d.allow_request} onChange={e=>patch(row.capability_key,{allow_request:e.target.checked})}/>طلب</label>
                <label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={d.allow_approval} onChange={e=>patch(row.capability_key,{allow_approval:e.target.checked})}/>اعتماد</label>
                <label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={d.allow_assignment} onChange={e=>patch(row.capability_key,{allow_assignment:e.target.checked})}/>تكليف</label>
              </td>
              <td className={styles.destinations}>
                {d.route_template==='general'?<select value={d.general_scope} onChange={e=>patch(row.capability_key,{general_scope:e.target.value})}>{Object.entries(SCOPE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:null}
                {d.route_template==='special'?<details><summary>{selectedCount?`${selectedCount} جهة محددة`:'حدد الجهات الخاصة'}</summary><div className={styles.destinationMenu}>{destinations.filter(x=>x.destination_key!==d.source_destination_key).map(dest=>{
                  const t=d.targets?.[dest.destination_key]||{selected:false,mandatory:false,blocking:true};
                  return <div key={dest.destination_key} className={styles.destinationRow}><label><input type="checkbox" checked={t.selected} onChange={e=>patchTarget(row.capability_key,dest.destination_key,{selected:e.target.checked})}/>{dest.label_ar}</label>{t.selected?<label className={styles.mandatory}><input type="checkbox" checked={t.mandatory} onChange={e=>patchTarget(row.capability_key,dest.destination_key,{mandatory:e.target.checked})}/>إلزامية</label>:null}</div>;
                })}</div></details>:null}
                {d.route_template==='none'?<span className={styles.noRoute}>لا حركة خارج العملية</span>:null}
                {d.route_template==='undecided'?<span className={styles.pendingDecision}>بانتظار قرارك</span>:null}
              </td>
              <td><div className={styles.sla}><input type="number" min="1" placeholder="—" value={d.default_sla_hours} onChange={e=>patch(row.capability_key,{default_sla_hours:e.target.value})}/><span>ساعة</span></div></td>
              <td><textarea rows={2} value={d.notes} onChange={e=>patch(row.capability_key,{notes:e.target.value})} placeholder="ملاحظة اختيارية"/></td>
              <td><button className={styles.saveButton} type="button" disabled={busyKey===row.capability_key} onClick={()=>save(row)}>{busyKey===row.capability_key?'…':'حفظ'}</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    {unmapped.length?<section className={styles.unmappedBox}>
      <div className={styles.blockHead}><div><span>التقاط بلا تخمين</span><h3>مصادر وجدتها الصنارة وتحتاج ربطًا</h3></div><p>نتركها لك بدل ربطها بعملية خاطئة. اختيار العملية هنا لا ينشئ مسار اعتماد؛ يربط المصدر بالدستور فقط.</p></div>
      <div className={styles.unmappedList}>{unmapped.map(source=><article key={source.source_key}>
        <div><strong>{source.relation_name}</strong><EffectChips row={source}/><small>{source.discovery_reason}</small></div>
        <div className={styles.linkControls}><select value={unmappedChoice[source.source_key]||''} onChange={e=>setUnmappedChoice(prev=>({...prev,[source.source_key]:e.target.value}))}><option value="">اختر العملية…</option>{linkableOperations.map(row=><option key={row.capability_key} value={row.capability_key}>{row.module_label_ar} · {row.resource_label_ar} · {row.action_label_ar}</option>)}</select><button type="button" disabled={linkBusy===source.source_key} onClick={()=>linkSource(source)}>{linkBusy===source.source_key?'جارٍ الربط…':'ربط بالدستور'}</button></div>
      </article>)}</div>
    </section>:null}
  </div>;
}
