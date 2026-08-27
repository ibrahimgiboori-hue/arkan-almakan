'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureRouteMatrix.module.css';

const MODULE_LABELS=Object.freeze({projects:'المشاريع',hr:'الموارد البشرية',finance:'المالية',system:'الإدارة'});
const ACTION_LABELS=Object.freeze({request:'طلب',route:'توجيه',assignment:'تكليف'});
const EFFECTS=[['has_temporal_effect','زمني'],['has_financial_effect','مالي'],['has_legal_effect','قانوني'],['has_printable_output','قابل للطباعة']];

const cardStyle={border:'1px solid rgba(111,37,43,.14)',borderRadius:14,background:'#fff',padding:14};
const softText={fontSize:12,color:'#746b68',lineHeight:1.7};
const smallBadge={display:'inline-flex',alignItems:'center',padding:'3px 7px',borderRadius:999,background:'#f3ecea',color:'#6f252b',fontSize:10,fontWeight:800,marginInlineEnd:4,marginBottom:4};

function liveBinding(draft){
  if(!draft?.requires_action)return {label:'لا تحتاج إجراء',parts:[]};
  const parts=[];
  if(draft.default_action_kind)parts.push('النوع');
  if(draft.default_target_destination_key)parts.push('البوابة');
  if(draft.default_target_user_id)parts.push('الموظف');
  if(!parts.length)return {label:'إلزام بإنشاء إجراء فقط',parts};
  if(parts.length===3)return {label:'المسار محدد بالكامل',parts};
  return {label:`إلزام جزئي: ${parts.join(' + ')}`,parts};
}

function Effects({row}){
  const list=EFFECTS.filter(([key])=>row[key]);
  if(!list.length)return <span style={{...softText,fontSize:10}}>غير مصنف</span>;
  return <div>{list.map(([key,label])=><span key={key} style={smallBadge}>{label}</span>)}</div>;
}

export default function ProcedureRouteMatrix(){
  const [rows,setRows]=useState([]);
  const [hooks,setHooks]=useState([]);
  const [destinations,setDestinations]=useState([]);
  const [unmapped,setUnmapped]=useState([]);
  const [agentStatus,setAgentStatus]=useState(null);
  const [drafts,setDrafts]=useState({});
  const [targetUsers,setTargetUsers]=useState({});
  const [unmappedChoice,setUnmappedChoice]=useState({});
  const [query,setQuery]=useState('');
  const [moduleFilter,setModuleFilter]=useState('all');
  const [actionFilter,setActionFilter]=useState('all');
  const [loading,setLoading]=useState(true);
  const [scanning,setScanning]=useState(false);
  const [busy,setBusy]=useState('');
  const [linkBusy,setLinkBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const load=useCallback(async({scan=false}={})=>{
    setLoading(true);setError('');
    let scanQ=null;
    if(scan){setScanning(true);scanQ=await supabase.rpc('fn_procedure_auto_discover_sources');}
    const [defsQ,hooksQ,destQ,unmappedQ,statusQ]=await Promise.all([
      supabase.rpc('fn_admin_transaction_definitions'),
      supabase.rpc('fn_admin_transaction_hooks',{p_transaction_key:null}),
      supabase.from('procedure_destinations').select('destination_key,label_ar,portal_key,destination_type').eq('is_active',true).order('sort_order'),
      supabase.rpc('fn_admin_unmapped_transaction_sources'),
      supabase.rpc('fn_procedure_agent_status'),
    ]);
    setScanning(false);
    const first=scanQ?.error||defsQ.error||hooksQ.error||destQ.error||unmappedQ.error||statusQ.error;
    if(first){setError(first.message||'تعذر تحميل دستور حركة المعاملات.');setLoading(false);return;}
    const defs=defsQ.data||[];
    setRows(defs);setHooks(hooksQ.data||[]);setDestinations(destQ.data||[]);setUnmapped(unmappedQ.data||[]);setAgentStatus(statusQ.data||null);
    setDrafts(Object.fromEntries(defs.map(row=>[row.transaction_key,{
      requires_action:Boolean(row.requires_action),
      default_action_kind:row.default_action_kind||'',
      default_target_destination_key:row.default_target_destination_key||'',
      default_target_user_id:row.default_target_user_id||'',
      default_target_user_name:row.default_target_user_name||'',
      default_action_note:row.default_action_note||'',
    }])));
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const hooksByTransaction=useMemo(()=>{
    const map=new Map();
    hooks.forEach(h=>{if(!map.has(h.transaction_key))map.set(h.transaction_key,[]);map.get(h.transaction_key).push(h);});
    return map;
  },[hooks]);

  const modules=useMemo(()=>[...new Set(rows.map(row=>row.module_key))],[rows]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return rows.filter(row=>{
      const draft=drafts[row.transaction_key]||{};
      if(moduleFilter!=='all'&&row.module_key!==moduleFilter)return false;
      if(actionFilter==='yes'&&!draft.requires_action)return false;
      if(actionFilter==='no'&&draft.requires_action)return false;
      if(!q)return true;
      return `${row.label_ar} ${row.description_ar||''} ${(row.hook_sources||[]).join(' ')}`.toLowerCase().includes(q);
    });
  },[rows,drafts,moduleFilter,actionFilter,query]);

  function patch(key,value){
    setDrafts(prev=>({...prev,[key]:{...prev[key],...value}}));
  }

  async function loadTargetUsers(transactionKey,destinationKey){
    if(!destinationKey)return;
    const cacheKey=`${transactionKey}:${destinationKey}`;
    if(targetUsers[cacheKey])return;
    const {data,error:e}=await supabase.rpc('fn_admin_procedure_target_users',{p_destination_key:destinationKey});
    if(e){setError(e.message);return;}
    setTargetUsers(prev=>({...prev,[cacheKey]:data||[]}));
  }

  async function save(row){
    const d=drafts[row.transaction_key];
    if(!d)return;
    setBusy(row.transaction_key);setError('');setMessage('');
    const {error:e}=await supabase.rpc('fn_admin_save_transaction_constitution',{
      p_transaction_key:row.transaction_key,
      p_requires_action:Boolean(d.requires_action),
      p_default_action_kind:d.default_action_kind||null,
      p_default_target_destination_key:d.default_target_destination_key||null,
      p_default_target_user_id:d.default_target_user_id||null,
      p_default_action_note:d.default_action_note?.trim()||null,
    });
    if(e){setError(e.message);setBusy('');return;}
    setMessage(`تم حفظ دستور «${row.label_ar}». كل خانة معبأة أصبحت قيدًا ملزمًا عند إنشاء الإجراء.`);
    await load();setBusy('');
  }

  async function linkSource(source){
    const transactionKey=unmappedChoice[source.source_key];
    if(!transactionKey){setError('اختر المعاملة التي تتبع لها هذه الصنارة أولًا.');return;}
    setLinkBusy(source.source_key);setError('');setMessage('');
    const {error:e}=await supabase.rpc('fn_admin_link_source_to_transaction',{p_source_key:source.source_key,p_transaction_key:transactionKey,p_capability_key:null});
    if(e){setError(e.message);setLinkBusy('');return;}
    setMessage(`تم ربط المصدر ${source.relation_name} بالمعاملة المختارة.`);await load();setLinkBusy('');
  }

  if(loading&&!rows.length)return <div className={styles.state}>جارٍ تجهيز دستور حركة المعاملات…</div>;

  return <div className={styles.root} dir="rtl">
    <section style={cardStyle}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div><div style={{fontSize:11,fontWeight:900,color:'#6f252b'}}>القلب المركزي</div><h3 style={{margin:'4px 0'}}>دستور حركة المعاملات</h3><p style={{...softText,margin:0,maxWidth:820}}>القاعدة: العمود الإلزامي الوحيد هو «تحتاج إجراء؟». أي بيانات إضافية تضعها في نفس الصف تصبح قيدًا دستوريًا ملزمًا؛ وما تتركه فارغًا يستكمله منشئ المعاملة عند ظهور الصنارة.</p></div>
        <button type="button" disabled={scanning} onClick={()=>load({scan:true})}>{scanning?'جارٍ فحص الصنارات…':'فحص الصنارات'}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginTop:12}}>
        <div><strong>{rows.length}</strong><small style={{display:'block'}}>معاملة معرفة</small></div>
        <div><strong>{hooks.length}</strong><small style={{display:'block'}}>صنارة مرتبطة</small></div>
        <div><strong>{agentStatus?.temporal_sources??0}</strong><small style={{display:'block'}}>مصدر زمني</small></div>
        <div><strong>{agentStatus?.financial_sources??0}</strong><small style={{display:'block'}}>مصدر مالي</small></div>
        <div><strong>{agentStatus?.legal_sources??0}</strong><small style={{display:'block'}}>مصدر قانوني</small></div>
        <div><strong>{unmapped.length}</strong><small style={{display:'block'}}>مصدر يحتاج ربطًا</small></div>
      </div>
    </section>

    <section style={{...cardStyle,background:'#faf8f7'}}>
      <strong style={{display:'block',marginBottom:4}}>كيف يعمل الإلزام؟</strong>
      <div style={{...softText,display:'grid',gap:2}}>
        <span>• «نعم» فقط: المنشئ ملزم بإنشاء إجراء ويختار النوع والبوابة.</span>
        <span>• تحدد البوابة: لا يستطيع المنشئ تغييرها.</span>
        <span>• تحدد الموظف: لا يستطيع توجيه المعاملة لغيره، ويجب أن يكون مؤهلًا داخل البوابة المحددة.</span>
        <span>• تحدد النوع + البوابة + الموظف: المسار محدد بالكامل، وتبقى الملاحظة فقط حسب الدستور.</span>
      </div>
    </section>

    <div className={styles.toolbar}>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث باسم المعاملة أو مصدرها…"/>
      <select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="all">كل البوابات</option>{modules.map(key=><option key={key} value={key}>{MODULE_LABELS[key]||key}</option>)}</select>
      <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)}><option value="all">كل المعاملات</option><option value="yes">تحتاج إجراء</option><option value="no">لا تحتاج إجراء</option></select>
      <button type="button" onClick={()=>load()}>تحديث</button>
    </div>

    {error?<div className={styles.error}>{error}</div>:null}
    {message?<div className={styles.success}>{message}</div>:null}

    <div className={styles.tableWrap}>
      <table className={styles.matrix} style={{minWidth:1500}}>
        <thead><tr><th>المعاملة</th><th>سبب دخول القلب</th><th>الصنارات</th><th>تحتاج إجراء؟</th><th>نوع الإجراء</th><th>البوابة الهدف</th><th>الموظف</th><th>الملاحظة</th><th>درجة الإلزام</th><th></th></tr></thead>
        <tbody>{visible.map(row=>{
          const d=drafts[row.transaction_key]||{};
          const rowHooks=hooksByTransaction.get(row.transaction_key)||[];
          const binding=liveBinding(d);
          const usersKey=`${row.transaction_key}:${d.default_target_destination_key}`;
          const users=targetUsers[usersKey]||[];
          return <tr key={row.transaction_key} className={d.requires_action?'':styles.unclassified}>
            <td className={styles.operation}><strong>{row.label_ar}</strong><span className={styles.portal}>{MODULE_LABELS[row.module_key]||row.module_key}</span>{row.description_ar?<small>{row.description_ar}</small>:null}{row.is_periodic_or_aggregate?<small>معاملة مجمعة / دورية</small>:null}</td>
            <td><Effects row={row}/></td>
            <td className={styles.destinations}><details><summary>{rowHooks.length||row.hook_count||0} صنارة</summary><div className={styles.destinationMenu}>{rowHooks.length?rowHooks.map(h=><div className={styles.destinationRow} key={h.id}><div><strong>{h.source_table}</strong><small>{h.role==='evidence'?'دليل تابع':h.role==='aggregate'?'المعاملة الأم':'مصدر رئيسي'}</small></div></div>):<div style={softText}>لا توجد صنارة مرتبطة بعد.</div>}</div></details></td>
            <td><label style={{display:'flex',gap:7,alignItems:'center',fontWeight:800}}><input type="checkbox" checked={Boolean(d.requires_action)} onChange={e=>patch(row.transaction_key,{requires_action:e.target.checked,...(!e.target.checked?{default_action_kind:'',default_target_destination_key:'',default_target_user_id:'',default_target_user_name:'',default_action_note:''}:{})})}/>{d.requires_action?'نعم':'لا'}</label></td>
            <td><select disabled={!d.requires_action} value={d.default_action_kind||''} onChange={e=>patch(row.transaction_key,{default_action_kind:e.target.value})}><option value="">يحدده المنشئ</option><option value="request">طلب</option><option value="route">توجيه</option><option value="assignment">تكليف</option></select>{d.default_action_kind?<small>مقيد: {ACTION_LABELS[d.default_action_kind]}</small>:<small>اختيار عند الصنارة</small>}</td>
            <td><select disabled={!d.requires_action} value={d.default_target_destination_key||''} onChange={async e=>{const value=e.target.value;patch(row.transaction_key,{default_target_destination_key:value,default_target_user_id:'',default_target_user_name:''});if(value)await loadTargetUsers(row.transaction_key,value);}}><option value="">يحددها المنشئ</option>{destinations.map(dest=><option key={dest.destination_key} value={dest.destination_key}>{dest.label_ar}</option>)}</select>{d.default_target_destination_key?<small>البوابة مقيدة بالدستور</small>:<small>اختيار عند الصنارة</small>}</td>
            <td><select disabled={!d.requires_action||!d.default_target_destination_key} value={d.default_target_user_id||''} onFocus={()=>loadTargetUsers(row.transaction_key,d.default_target_destination_key)} onChange={e=>{const user=users.find(x=>x.user_id===e.target.value);patch(row.transaction_key,{default_target_user_id:e.target.value,default_target_user_name:user?.full_name_ar||''});}}><option value="">اختياري / يحدده المنشئ</option>{d.default_target_user_id&&d.default_target_user_name&&!users.some(x=>x.user_id===d.default_target_user_id)?<option value={d.default_target_user_id}>{d.default_target_user_name}</option>:null}{users.map(user=><option key={user.user_id} value={user.user_id}>{user.full_name_ar}</option>)}</select>{d.default_target_user_id?<small>الموظف مقيد بالدستور</small>:<small>{d.default_target_destination_key?'اختياري':'حدد البوابة أولًا'}</small>}</td>
            <td><input disabled={!d.requires_action} value={d.default_action_note||''} onChange={e=>patch(row.transaction_key,{default_action_note:e.target.value})} placeholder="اختيارية" style={{width:190}}/></td>
            <td><strong style={{fontSize:11,color:d.requires_action?'#6f252b':'#6b6664'}}>{binding.label}</strong>{binding.parts.length?<small>كل عنصر مذكور مقفل على المنشئ.</small>:null}</td>
            <td><button type="button" disabled={busy===row.transaction_key} onClick={()=>save(row)}>{busy===row.transaction_key?'حفظ…':'حفظ'}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    {unmapped.length?<section style={cardStyle}>
      <div style={{marginBottom:10}}><strong>صنارات اكتشفها القلب وتحتاج ربطًا</strong><p style={{...softText,margin:'4px 0 0'}}>لا نربطها تلقائيًا حتى لا نخمن معنى العملية. اختر المعاملة الأم الصحيحة فقط.</p></div>
      <div style={{display:'grid',gap:8}}>{unmapped.map(source=><div key={source.source_key} style={{display:'grid',gridTemplateColumns:'minmax(220px,1fr) minmax(240px,1fr) auto',gap:8,alignItems:'center',borderTop:'1px solid rgba(111,37,43,.08)',paddingTop:8}}><div><strong>{source.relation_name}</strong><small style={{display:'block'}}>{source.discovery_reason}</small></div><select value={unmappedChoice[source.source_key]||''} onChange={e=>setUnmappedChoice(prev=>({...prev,[source.source_key]:e.target.value}))}><option value="">اختر المعاملة…</option>{rows.map(row=><option key={row.transaction_key} value={row.transaction_key}>{row.label_ar}</option>)}</select><button type="button" disabled={linkBusy===source.source_key} onClick={()=>linkSource(source)}>{linkBusy===source.source_key?'ربط…':'ربط الصنارة'}</button></div>)}</div>
    </section>:null}
  </div>;
}
