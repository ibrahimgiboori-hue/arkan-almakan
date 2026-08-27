' use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureRouteMatrix.module.css';

const MODULE_LABELS=Object.freeze({projects:'المشاريع',hr:'الموارد البشرية',finance:'المالية',system:'الإدارة'});
const ROUTE_LABELS=Object.freeze({undecided:'غير محدد',none:'لا مسار',general:'مسار عام',special:'مسار خاص'});
const MOVEMENT_LABELS=Object.freeze({choose:'يختار عند الإرسال',request:'طلب / طلب إجراء',approval:'طلب اعتماد',assignment:'تكليف'});
const SCOPE_LABELS=Object.freeze({both:'داخل البوابة أو خارجها',same_portal:'داخل البوابة فقط',cross_portal:'عبر البوابات فقط'});
const ROLE_LABELS=Object.freeze({aggregate:'المعاملة الأم / فترة',primary:'مصدر رئيسي',evidence:'دليل تشغيلي',settlement:'تنفيذ / تسوية',detail:'تفصيل'});
const EFFECTS=[['has_temporal_effect','زمني'],['has_financial_effect','مالي'],['has_legal_effect','قانوني'],['has_printable_output','مستند']];

function effects(row){
  const active=EFFECTS.filter(([key])=>row[key]);
  return active.length?<div className={styles.effects}>{active.map(([key,label])=><span key={key}>{label}</span>)}</div>:<span className={styles.effectNone}>بدون أثر مصنف</span>;
}

function Rules({rows}){
  if(!rows.length)return null;
  return <section className={styles.rulesBox}>
    <div className={styles.blockHead}><div><span>قواعد الحركة العامة</span><h3>الطلب والتكليف والاعتماد</h3></div><p>الصنارة لا تطبق هذه القواعد. القلب يقرأها بعد وصول حدث المعاملة إليه.</p></div>
    <div className={styles.rulesGrid}>{rows.map(rule=><article key={rule.movement_kind}><strong>{rule.label_ar}</strong><p>{rule.description_ar}</p><small>{rule.requires_target_portal_gate?'عبر البوابات: المرور بمسؤول البوابة الهدف إلزامي لهذا النوع.':'لا توجد بوابة وسيطة إلزامية لهذا النوع.'}</small></article>)}</div>
  </section>;
}

export default function ProcedureRouteMatrix(){
  const [definitions,setDefinitions]=useState([]);
  const [hooks,setHooks]=useState([]);
  const [rules,setRules]=useState([]);
  const [destinations,setDestinations]=useState([]);
  const [targets,setTargets]=useState([]);
  const [unmapped,setUnmapped]=useState([]);
  const [agentStatus,setAgentStatus]=useState(null);
  const [drafts,setDrafts]=useState({});
  const [unmappedChoice,setUnmappedChoice]=useState({});
  const [loading,setLoading]=useState(true);
  const [scanning,setScanning]=useState(false);
  const [busy,setBusy]=useState('');
  const [linkBusy,setLinkBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [moduleFilter,setModuleFilter]=useState('all');
  const [routeFilter,setRouteFilter]=useState('all');

  const load=useCallback(async({scan=false}={})=>{
    setLoading(true);setError('');
    let scanQ=null;
    if(scan){setScanning(true);scanQ=await supabase.rpc('fn_procedure_auto_discover_sources');}
    const [defsQ,hooksQ,rulesQ,destQ,targetsQ,unmappedQ,statusQ]=await Promise.all([
      supabase.rpc('fn_admin_transaction_definitions'),
      supabase.rpc('fn_admin_transaction_hooks',{p_transaction_key:null}),
      supabase.from('procedure_movement_rules').select('movement_kind,label_ar,requires_target_portal_gate,description_ar,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('procedure_destinations').select('destination_key,label_ar,is_active,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('transaction_route_targets').select('id,transaction_key,from_destination_key,to_destination_key,movement_kind,is_mandatory,is_blocking,allow_specific_user,is_active').eq('is_active',true),
      supabase.rpc('fn_admin_unmapped_transaction_sources'),
      supabase.rpc('fn_procedure_agent_status'),
    ]);
    setScanning(false);
    const first=scanQ?.error||defsQ.error||hooksQ.error||rulesQ.error||destQ.error||targetsQ.error||unmappedQ.error||statusQ.error;
    if(first){setError(first.message||'تعذر تحميل دستور حركة المعاملات.');setLoading(false);return;}
    const defs=defsQ.data||[];
    setDefinitions(defs);setHooks(hooksQ.data||[]);setRules(rulesQ.data||[]);setDestinations(destQ.data||[]);setTargets(targetsQ.data||[]);setUnmapped(unmappedQ.data||[]);setAgentStatus(statusQ.data||null);
    setDrafts(Object.fromEntries(defs.map(row=>[row.transaction_key,{
      route_template:row.route_template||'undecided',default_movement_kind:row.default_movement_kind||'choose',
      allow_request:row.allow_request!==false,allow_approval:row.allow_approval!==false,allow_assignment:Boolean(row.allow_assignment),allow_inquiry:row.allow_inquiry!==false,
      general_scope:row.general_scope||'both',
    }])));
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const hooksByTransaction=useMemo(()=>{
    const map=new Map();hooks.forEach(h=>{if(!map.has(h.transaction_key))map.set(h.transaction_key,[]);map.get(h.transaction_key).push(h);});return map;
  },[hooks]);
  const targetMap=useMemo(()=>{
    const map=new Map();targets.forEach(t=>{if(!map.has(t.transaction_key))map.set(t.transaction_key,new Set());map.get(t.transaction_key).add(t.to_destination_key);});return map;
  },[targets]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return definitions.filter(row=>{
      if(moduleFilter!=='all'&&row.module_key!==moduleFilter)return false;
      if(routeFilter!=='all'&&row.route_template!==routeFilter)return false;
      if(!q)return true;
      return `${row.label_ar} ${row.description_ar||''} ${(row.hook_sources||[]).join(' ')}`.toLowerCase().includes(q);
    });
  },[definitions,moduleFilter,routeFilter,query]);
  const modules=useMemo(()=>[...new Set(definitions.map(x=>x.module_key))],[definitions]);

  function patch(key,value){setDrafts(prev=>({...prev,[key]:{...prev[key],...value}}));}

  async function save(row){
    const d=drafts[row.transaction_key];if(!d)return;
    setBusy(row.transaction_key);setError('');setMessage('');
    const policyQ=await supabase.rpc('fn_admin_save_transaction_definition_policy',{
      p_transaction_key:row.transaction_key,p_route_template:d.route_template,p_default_movement_kind:d.default_movement_kind,
      p_allow_request:Boolean(d.allow_request),p_allow_approval:Boolean(d.allow_approval),p_allow_assignment:Boolean(d.allow_assignment),p_allow_inquiry:Boolean(d.allow_inquiry),p_general_scope:d.general_scope,
    });
    if(policyQ.error){setError(policyQ.error.message);setBusy('');return;}
    if(d.route_template!=='special'){
      const del=await supabase.from('transaction_route_targets').delete().eq('transaction_key',row.transaction_key);
      if(del.error){setError(del.error.message);setBusy('');return;}
    }
    setMessage(`تم حفظ دستور: ${row.label_ar}`);await load();setBusy('');
  }

  async function toggleTarget(row,destinationKey,checked){
    setError('');setMessage('');
    const movement=(drafts[row.transaction_key]?.default_movement_kind||'approval')==='choose'?'approval':drafts[row.transaction_key]?.default_movement_kind;
    if(checked){
      const {error:e}=await supabase.from('transaction_route_targets').upsert({
        transaction_key:row.transaction_key,from_destination_key:row.source_destination_key,to_destination_key:destinationKey,movement_kind:movement,is_mandatory:false,is_blocking:true,allow_specific_user:true,is_active:true,
      },{onConflict:'transaction_key,from_destination_key,to_destination_key,movement_kind'});
      if(e){setError(e.message);return;}
    }else{
      const {error:e}=await supabase.from('transaction_route_targets').delete().eq('transaction_key',row.transaction_key).eq('to_destination_key',destinationKey);
      if(e){setError(e.message);return;}
    }
    await load();
  }

  async function linkSource(source){
    const transactionKey=unmappedChoice[source.source_key];if(!transactionKey){setError('اختر المعاملة التي تتبع لها هذه الصنارة أولاً.');return;}
    setLinkBusy(source.source_key);setError('');setMessage('');
    const {error:e}=await supabase.rpc('fn_admin_link_source_to_transaction',{p_source_key:source.source_key,p_transaction_key:transactionKey,p_capability_key:null});
    if(e){setError(e.message);setLinkBusy('');return;}
    setMessage(`تم ربط ${source.relation_name} بالمعاملة المختارة.`);await load();setLinkBusy('');
  }

  if(loading&&!definitions.length)return <div className={styles.state}>جارٍ تجهيز القلب المركزي ودستور المعاملات…</div>;

  return <div className={styles.root} dir="rtl">
    <section className={styles.agentBox}>
      <div className={styles.agentHead}><div><span>الصنارة</span><h3>نقاط التقاط المعاملات</h3><p>الصنارة مجرد حساس: تقول للقلب إن حدثًا وقع على معاملة. لا تختار جهة، ولا تعتمد، ولا تكلف، ولا تغيّر منطق التشغيل.</p></div><button type="button" disabled={scanning} onClick={()=>load({scan:true})}>{scanning?'جارٍ الفحص…':'فحص وزرع الصنارات'}</button></div>
      <div className={styles.statGrid}>
        <div><strong>{definitions.length}</strong><span>نوع معاملة</span></div><div><strong>{hooks.length}</strong><span>صنارة مرتبطة</span></div><div><strong>{agentStatus?.temporal_sources??0}</strong><span>مصدر زمني</span></div><div><strong>{agentStatus?.financial_sources??0}</strong><span>مصدر مالي</span></div><div><strong>{agentStatus?.legal_sources??0}</strong><span>مصدر قانوني</span></div><div><strong>{unmapped.length}</strong><span>صنارة تحتاج ربطًا</span></div>
      </div>
    </section>

    <Rules rows={rules}/>

    <section className={styles.constitutionBox}>
      <div className={styles.blockHead}><div><span>دستور حركة المعاملات</span><h3>المعاملة مرة واحدة، والصنارات تحتها</h3></div><p>حدد هنا فقط: هل لها مسار؟ عام أم خاص؟ وما أنواع الحركة التي يسمح بها القلب لهذه المعاملة.</p></div>
      <div className={styles.toolbar}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم المعاملة أو مصدرها…"/>
        <select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="all">كل البوابات</option>{modules.map(key=><option key={key} value={key}>{MODULE_LABELS[key]||key}</option>)}</select>
        <select value={routeFilter} onChange={e=>setRouteFilter(e.target.value)}><option value="all">كل قرارات المسار</option>{Object.entries(ROUTE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <button type="button" onClick={()=>load()}>تحديث</button>
      </div>
      {error?<div className={styles.error}>{error}</div>:null}{message?<div className={styles.success}>{message}</div>:null}
      <div className={styles.tableWrap}><table className={styles.matrix}><thead><tr><th>المعاملة</th><th>سبب دخول القلب</th><th>الصنارات</th><th>المسار</th><th>الحركة الافتراضية</th><th>الحركات المسموحة</th><th>المجال / الجهات</th><th></th></tr></thead><tbody>{visible.map(row=>{
        const d=drafts[row.transaction_key]||{};const rowHooks=hooksByTransaction.get(row.transaction_key)||[];const selected=targetMap.get(row.transaction_key)||new Set();
        return <tr key={row.transaction_key} className={d.route_template==='undecided'?styles.unclassified:''}>
          <td className={styles.operation}><strong>{row.label_ar}</strong><span className={styles.portal}>{MODULE_LABELS[row.module_key]||row.module_key}</span><small>{row.description_ar}</small>{row.is_periodic_or_aggregate?<small className={styles.aggregateTag}>معاملة مجمعة / دورية</small>:null}</td>
          <td>{effects(row)}</td>
          <td className={styles.destinations}><details><summary>{rowHooks.length} نقطة التقاط</summary><div className={styles.destinationMenu}>{rowHooks.map(h=><div key={h.id} className={styles.destinationRow}><div><strong>{h.source_table}</strong><small>{ROLE_LABELS[h.role]||h.role}</small></div></div>)}</div></details></td>
          <td><select value={d.route_template||'undecided'} onChange={e=>patch(row.transaction_key,{route_template:e.target.value})}>{Object.entries(ROUTE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
          <td><select disabled={d.route_template==='none'||d.route_template==='undecided'} value={d.default_movement_kind||'choose'} onChange={e=>patch(row.transaction_key,{default_movement_kind:e.target.value})}>{Object.entries(MOVEMENT_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
          <td className={styles.allowedKinds}><label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={Boolean(d.allow_request)} onChange={e=>patch(row.transaction_key,{allow_request:e.target.checked})}/>طلب</label><label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={Boolean(d.allow_approval)} onChange={e=>patch(row.transaction_key,{allow_approval:e.target.checked})}/>اعتماد</label><label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={Boolean(d.allow_assignment)} onChange={e=>patch(row.transaction_key,{allow_assignment:e.target.checked})}/>تكليف</label><label><input type="checkbox" disabled={d.route_template==='none'||d.route_template==='undecided'} checked={Boolean(d.allow_inquiry)} onChange={e=>patch(row.transaction_key,{allow_inquiry:e.target.checked})}/>استفسار</label></td>
          <td className={styles.destinations}>{d.route_template==='general'?<select value={d.general_scope||'both'} onChange={e=>patch(row.transaction_key,{general_scope:e.target.value})}>{Object.entries(SCOPE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:null}{d.route_template==='special'?<details><summary>{selected.size?`${selected.size} جهة محددة`:'حدد الجهات الخاصة'}</summary><div className={styles.destinationMenu}>{destinations.filter(dest=>dest.destination_key!==row.source_destination_key).map(dest=><div key={dest.destination_key} className={styles.destinationRow}><label><input type="checkbox" checked={selected.has(dest.destination_key)} onChange={e=>toggleTarget(row,dest.destination_key,e.target.checked)}/>{dest.label_ar}</label></div>)}</div></details>:null}{d.route_template==='none'?<span className={styles.noRoute}>لا مسار</span>:null}{d.route_template==='undecided'?<span className={styles.pendingDecision}>بانتظار قرارك</span>:null}</td>
          <td><button className={styles.saveButton} type="button" disabled={busy===row.transaction_key} onClick={()=>save(row)}>{busy===row.transaction_key?'…':'حفظ'}</button></td>
        </tr>;
      })}</tbody></table></div>
    </section>

    {unmapped.length?<section className={styles.unmappedBox}><div className={styles.blockHead}><div><span>صنارات بلا معاملة</span><h3>التقطنا المصدر ولم نخمن وجهته</h3></div><p>اربط المصدر بنوع المعاملة فقط. هذا لا يرسل شيئًا ولا ينشئ اعتمادًا.</p></div><div className={styles.unmappedList}>{unmapped.map(source=><article key={source.source_key}><div><strong>{source.relation_name}</strong><small>{source.discovery_reason}</small></div><div className={styles.linkControls}><select value={unmappedChoice[source.source_key]||''} onChange={e=>setUnmappedChoice(prev=>({...prev,[source.source_key]:e.target.value}))}><option value="">اختر المعاملة…</option>{definitions.map(row=><option key={row.transaction_key} value={row.transaction_key}>{MODULE_LABELS[row.module_key]||row.module_key} · {row.label_ar}</option>)}</select><button type="button" disabled={linkBusy===source.source_key} onClick={()=>linkSource(source)}>{linkBusy===source.source_key?'جارٍ الربط…':'ربط الصنارة'}</button></div></article>)}</div></section>:null}
  </div>;
}
