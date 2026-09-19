'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateTimeAr, moneyOrDash } from '@/lib/format';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import styles from '../my-work/approvals/approvals.module.css';

const WORKFLOW_STATUS={pending:'قيد الاعتماد',returned:'مُعاد للتعديل',approved:'معتمد',rejected:'مرفوض',cancelled:'ملغى'};
const STEP_STATUS={pending:'قيد الانتظار',approved:'معتمدة',returned:'أُعيدت للتعديل',rejected:'مرفوضة',cancelled:'ملغاة'};

const SNAPSHOT_LABELS=Object.freeze({
  voucher_no:'رقم السند',voucher_date:'تاريخ السند',voucher_type:'نوع السند',amount:'المبلغ',amount_words:'المبلغ كتابة',
  party_name:'الطرف / المستفيد',party_id_number:'رقم الهوية / الإقامة',party_mobile:'الجوال',party_address:'المدينة / العنوان',
  party_nationality:'الجنسية',payment_method:'طريقة الدفع',payment_reference:'مرجع الدفع',payment_date:'تاريخ الدفع',
  description:'البيان / السبب',status:'الحالة',book_no:'رقم الدفتر',page_no:'رقم السند بالدفتر',
  project_no:'رقم المشروع',name_ar:'اسم المشروع',project_name:'المشروع',city:'المدينة',contract_value:'قيمة العقد',
  total_net:'صافي المبلغ',total_gross:'الإجمالي',total_deductions:'الاستقطاعات',run_month:'شهر المسير',
  claim_no:'رقم المستخلص',period_from:'من',period_to:'إلى',gross_amount:'الإجمالي',net_payable:'صافي المستحق',
  contractor_name:'المقاول',week_no:'الأسبوع',start_date:'من',end_date:'إلى',total_amount:'الإجمالي',
  quote_no:'رقم العرض',quote_date:'تاريخ العرض',client_name:'العميل',grand_total:'الإجمالي شامل الضريبة',
  qty:'الكمية',unit:'الوحدة',unit_price:'سعر الوحدة',sell_price:'سعر البيع',line_total:'الإجمالي',description_ar:'البيان',
});
const SNAPSHOT_HIDDEN=new Set(['id','book_id','account_id','project_id','created_by','created_at','updated_at','voided_by','approval_workflow_id','treasury_movement_id','issuer_employee_id','accountant_employee_id','approved_by_employee_id','_operation']);

function snapshotLabel(key){return SNAPSHOT_LABELS[key]||String(key||'').replaceAll('_',' ');}
function snapshotValue(value){
  if(value===null||value===undefined||value==='')return '—';
  if(typeof value==='boolean')return value?'نعم':'لا';
  if(typeof value==='number')return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
  return String(value);
}
function ApprovalSnapshot({snapshot}){
  if(!snapshot||typeof snapshot!=='object')return <div className={styles.muted}>لا توجد نسخة بيانات مرفقة بهذه المعاملة.</div>;
  const scalarEntries=Object.entries(snapshot).filter(([key,value])=>!SNAPSHOT_HIDDEN.has(key)&&!Array.isArray(value)&&(value===null||typeof value!=='object'));
  const nestedEntries=Object.entries(snapshot).filter(([key,value])=>!SNAPSHOT_HIDDEN.has(key)&&value&&typeof value==='object');
  return <div style={{display:'grid',gap:12}}>
    {scalarEntries.length?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>{scalarEntries.map(([key,value])=><div key={key} style={{border:'1px solid rgba(111,37,43,.12)',borderRadius:10,padding:'9px 10px',background:'#fff'}}><small style={{display:'block',color:'#776d69',marginBottom:4}}>{snapshotLabel(key)}</small><strong style={{fontSize:13,lineHeight:1.55}}>{snapshotValue(value)}</strong></div>)}</div>:null}
    {nestedEntries.map(([key,value])=>{
      if(Array.isArray(value)){
        const rows=value.filter(item=>item&&typeof item==='object').slice(0,100);
        if(!rows.length)return null;
        const cols=[...new Set(rows.flatMap(row=>Object.keys(row).filter(k=>!SNAPSHOT_HIDDEN.has(k))))].slice(0,8);
        return <details key={key} open><summary style={{fontWeight:800,cursor:'pointer'}}>{snapshotLabel(key)} · {rows.length}</summary><div style={{overflowX:'auto',marginTop:8}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:Math.max(520,cols.length*120)}}><thead><tr>{cols.map(col=><th key={col} style={{textAlign:'right',padding:7,borderBottom:'1px solid #ddd'}}>{snapshotLabel(col)}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{cols.map(col=><td key={col} style={{padding:7,borderBottom:'1px solid #eee',verticalAlign:'top'}}>{row[col]&&typeof row[col]==='object'?'—':snapshotValue(row[col])}</td>)}</tr>)}</tbody></table></div></details>;
      }
      const entries=Object.entries(value).filter(([k,v])=>!SNAPSHOT_HIDDEN.has(k)&&(v===null||typeof v!=='object'));
      return <details key={key} open><summary style={{fontWeight:800,cursor:'pointer'}}>{snapshotLabel(key)}</summary><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:8}}>{entries.map(([k,v])=><div key={k} style={{border:'1px solid rgba(111,37,43,.12)',borderRadius:10,padding:'8px 9px'}}><small style={{display:'block',color:'#776d69'}}>{snapshotLabel(k)}</small><strong>{snapshotValue(v)}</strong></div>)}</div></details>;
    })}
  </div>;
}

export default function ApprovalsPage(){
  const me=useDashboardSession();
  const approverOnly=Boolean(me?.access_profile==='approval_only');
  const detailRef=useRef(null);
  const [rows,setRows]=useState(null),[selectedId,setSelectedId]=useState(''),[detail,setDetail]=useState(null),[note,setNote]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [routeDestinations,setRouteDestinations]=useState([]),[routeDestination,setRouteDestination]=useState(''),[routeUsers,setRouteUsers]=useState([]),[nextUser,setNextUser]=useState(''),[nextReason,setNextReason]=useState('');

  const load=useCallback(async()=>{
    setError('');const{data,error:rpcError}=await supabase.rpc('fn_my_approval_inbox');
    if(rpcError){setRows([]);setError(rpcError.message||'تعذر تحميل الاعتمادات.');return;}
    const list=data||[];setRows(list);setSelectedId(current=>current&&list.some(row=>row.workflow_id===current)?current:(list[0]?.workflow_id||''));
  },[]);
  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    if(!selectedId){setDetail(null);return;}
    let alive=true;setDetail(null);setError('');setNote('');setRouteDestination('');setRouteUsers([]);setNextUser('');setNextReason('');
    supabase.rpc('fn_approval_get',{p_workflow_id:selectedId}).then(({data,error:rpcError})=>{
      if(!alive)return;
      if(rpcError){setError(rpcError.message||'تعذر قراءة تفاصيل المعاملة.');setDetail(null);}else setDetail(data||null);
    });
    return()=>{alive=false;};
  },[selectedId]);

  useEffect(()=>{
    if(!selectedId||typeof window==='undefined'||!window.matchMedia('(max-width: 900px)').matches)return undefined;
    const frame=window.requestAnimationFrame(()=>{detailRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
    return()=>window.cancelAnimationFrame(frame);
  },[selectedId]);

  const selected=useMemo(()=>rows?.find(row=>row.workflow_id===selectedId)||null,[rows,selectedId]);
  const isClaim=selected?.transaction_type==='progress_claim';

  useEffect(()=>{
    if(isClaim||!detail?.can_route){setRouteDestinations([]);return;}
    let alive=true;
    supabase.rpc('fn_approval_route_destinations').then(({data,error:rpcError})=>{
      if(!alive)return;if(rpcError)setError(rpcError.message||'تعذر تحميل جهات التعميد.');else setRouteDestinations(data||[]);
    });
    return()=>{alive=false;};
  },[detail?.can_route,selectedId,isClaim]);

  useEffect(()=>{
    if(!routeDestination){setRouteUsers([]);setNextUser('');return;}
    let alive=true;setNextUser('');
    supabase.rpc('fn_admin_procedure_target_users',{p_destination_key:routeDestination}).then(({data,error:rpcError})=>{
      if(!alive)return;if(rpcError){setRouteUsers([]);setError(rpcError.message||'تعذر تحميل مستخدمي جهة التعميد.');}else setRouteUsers(data||[]);
    });
    return()=>{alive=false;};
  },[routeDestination]);

  async function decide(decision,{route=false}={}){
    if(!selectedId||isClaim)return;const clean=note.trim();
    if(decision!=='approve'&&!clean){setError('اكتب سبب الإرجاع أو الرفض قبل تنفيذ القرار.');return;}
    if(route&&(!routeDestination||!nextUser)){setError('اختر بوابة التعميد والشخص الذي ستُحال إليه المعاملة.');return;}
    if(route&&!nextReason.trim()){setError('اكتب سبب الإحالة للتعميد.');return;}
    const action=route?'route':decision;setBusy(action);setError('');setMessage('');
    const{data:decisionStatus,error:rpcError}=await supabase.rpc('fn_approval_decide',{
      p_workflow_id:selectedId,p_decision:decision,p_comment:clean||null,p_next_user_id:route?nextUser:null,p_next_capability:null,p_next_reason:route?nextReason.trim():null,
    });
    if(rpcError)setError(rpcError.message||'تعذر تنفيذ القرار.');
    else{
      const approveMessage=decisionStatus==='pending'?'تم اعتماد هذه المرحلة وانتقلت المعاملة تلقائيًا إلى المرحلة التالية.':'تم اعتماد المعاملة نهائيًا.';
      setMessage(route?'تم اعتماد المرحلة الحالية وإحالة المعاملة للتعميد التالي.':decision==='approve'?approveMessage:decision==='return'?'تم إرجاع المعاملة للتعديل.':'تم رفض المعاملة.');
      setNote('');setRouteDestination('');setRouteUsers([]);setNextUser('');setNextReason('');await load();
    }
    setBusy('');
  }

  if(rows===null)return <ConstitutionPage><EmptyState title="جارٍ تحميل الاعتمادات" description="يتم جمع المعاملات التي تحتاج قرارك الآن."/></ConstitutionPage>;
  const workflow=detail?.workflow||null,steps=detail?.steps||[],events=detail?.events||[];
  const stageLabel=detail?.current_stage_label||'القرار';
  const approveLabel=detail?.is_final_stage===false?'اعتماد المرحلة':'اعتماد نهائي';

  return <ConstitutionPage>
    <PageHeader eyebrow={approverOnly?'الإدارة':'العمل'} title={approverOnly?'مكتب الاعتمادات':'الاعتمادات'} description={approverOnly?'واجهة إدارية لمراجعة المستندات والمعاملات الموجهة إليك واتخاذ القرار دون الدخول إلى البوابات التنفيذية.':'صندوق وصول للمعاملات التي تحتاجك. إذا كانت المعاملة لها رحلة أصلية، يتم القرار داخل رحلتها نفسها ولا نفتح لها سطح عمل ثانياً.'}/>
    {error?<Notice tone="warning">{error}</Notice>:null}{message?<Notice tone="success">{message}</Notice>:null}
    <div className={styles.shell}>
      <Section title="بانتظار قراري" description={`${rows.length} معاملة تحتاج إجراء`}>
        {rows.length===0?<EmptyState title="لا توجد اعتمادات بانتظارك" description="ستظهر هنا أي معاملة فور وصول مرحلة اعتماد إليك أو إلى صلاحية تملكها."/>:<div className={styles.list}>{rows.map(row=><button type="button" key={row.workflow_id} className={`${styles.item} ${row.workflow_id===selectedId?styles.active:''}`} aria-controls="approval-detail" aria-expanded={row.workflow_id===selectedId} onClick={()=>setSelectedId(row.workflow_id)}><div className={styles.itemHead}><strong>{row.label_ar||row.transaction_type}</strong><span>{row.workflow_no||'—'}</span></div><div className={styles.title}>{row.source_label||'معاملة'}</div><div className={styles.meta}><span>{row.origin_group_label||'—'}</span><span>{row.target_group_label||'—'}</span><span>{moneyOrDash(row.amount)}</span></div><small>{dateTimeAr(row.submitted_at)}</small></button>)}</div>}
      </Section>

      <div id="approval-detail" ref={detailRef} className={styles.detail} style={{scrollMarginTop:112}}>
        {!selected?<EmptyState title="اختر معاملة" description="اختر معاملة من القائمة."/>:!workflow?<EmptyState title="جارٍ قراءة المعاملة" description="يتم تحميل تفاصيل النسخة الحالية."/>:<Section title={workflow.source_label||selected.label_ar||'معاملة اعتماد'} description={`${workflow.workflow_no||'—'} · النسخة ${workflow.version_no||1}`}>
          <div className={styles.summary}><div><span>الحالة</span><strong>{WORKFLOW_STATUS[workflow.status]||workflow.status||'—'}</strong></div><div><span>المرحلة الحالية</span><strong>{stageLabel}</strong></div><div><span>المبلغ</span><strong>{moneyOrDash(workflow.amount)}</strong></div></div>
          <div className={styles.block}><h3>نسخة المعاملة المرسلة للاعتماد</h3><ApprovalSnapshot snapshot={detail?.snapshot}/></div>

          {isClaim?<div className={styles.block}>
            <h3>المستخلص له رحلة واحدة</h3>
            <div className={styles.muted} style={{marginBottom:12}}>لن تتخذ القرار هنا ثم تعود للمشروع. افتح المستخلص نفسه، وستجد قرار الاعتماد والخطوة التالية في نفس المسار حتى التحصيل والفاتورة.</div>
            <Link className="btn" href={`/dashboard/projects/${workflow.project_id}?view=claims&claim=${workflow.source_id}`}>فتح رحلة المستخلص</Link>
          </div>:<>
            <div className={styles.block}><h3>مسار الاعتماد</h3>{steps.length===0?<div className={styles.muted}>لا توجد خطوات مسجلة.</div>:<div className={styles.timeline}>{steps.map(step=><div className={styles.event} key={step.id}><div className={styles.eventHead}><strong>الخطوة {step.step_order} · {step.target_group_label||(step.target_type==='user'?'شخص محدد':'الجهة المختصة')}</strong><span>{STEP_STATUS[step.status]||step.status}</span></div>{step.request_reason?<div>{step.request_reason}</div>:null}{step.decision_comment?<div>{step.decision_comment}</div>:null}{step.acted_at?<small>{dateTimeAr(step.acted_at)}</small>:null}</div>)}</div>}</div>
            {events.length?<div className={styles.block}><h3>سجل الحركة</h3><div className={styles.timeline}>{events.map((event,index)=><div className={styles.event} key={`${event.created_at}-${index}`}><div className={styles.eventHead}><strong>{event.event_type}</strong><span>{dateTimeAr(event.created_at)}</span></div>{event.note?<div>{event.note}</div>:null}</div>)}</div></div>:null}
            {detail?.can_act&&workflow.status==='pending'?<div className={styles.block}>
              <h3>{stageLabel}</h3>
              <label className={styles.field}>تهميش القرار<textarea value={note} onChange={event=>setNote(event.target.value)} rows={4} maxLength={2000} placeholder="اختياري عند الاعتماد، وإلزامي عند الإرجاع أو الرفض"/></label>
              <div className={styles.actions}><button className="btn" type="button" disabled={Boolean(busy)} onClick={()=>decide('approve')}>{busy==='approve'?'جارٍ الاعتماد…':approveLabel}</button><button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={()=>decide('return')}>إرجاع للتعديل</button><button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={()=>decide('reject')}>رفض</button></div>
              {detail?.can_route?<div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--raw-line, #ddd)',display:'grid',gap:10}}><h3 style={{margin:0}}>اعتماد وإحالة للتعميد</h3><div className="form-grid"><div className="field"><label>بوابة التعميد</label><select value={routeDestination} onChange={e=>setRouteDestination(e.target.value)}><option value="">اختر البوابة</option>{routeDestinations.map(d=><option key={d.destination_key} value={d.destination_key}>{d.label_ar}</option>)}</select></div><div className="field"><label>المعتمد التالي</label><select value={nextUser} onChange={e=>setNextUser(e.target.value)} disabled={!routeDestination}><option value="">اختر الشخص</option>{routeUsers.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name_ar}{u.is_system_admin?' — مدير النظام':''}</option>)}</select></div><div className="field span2"><label>تهميش التوجيه / سبب الإحالة</label><input value={nextReason} onChange={e=>setNextReason(e.target.value)} maxLength={1000}/></div></div><div><button className="btn" type="button" disabled={Boolean(busy)||!nextUser||!nextReason.trim()} onClick={()=>decide('approve',{route:true})}>اعتماد المرحلة وإرسالها للتعميد</button></div></div>:null}
            </div>:<div className={styles.block}><div className={styles.muted}>هذه المعاملة للمتابعة فقط أو لم تعد بانتظار قرارك.</div></div>}
          </>}
        </Section>}
      </div>
    </div>
  </ConstitutionPage>;
}
