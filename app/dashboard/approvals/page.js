'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateTimeAr, moneyOrDash } from '@/lib/format';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from '../my-work/approvals/approvals.module.css';

const WORKFLOW_STATUS={pending:'قيد الاعتماد',returned:'مُعاد للتعديل',approved:'معتمد',rejected:'مرفوض',cancelled:'ملغى'};
const STEP_STATUS={pending:'قيد الانتظار',approved:'معتمدة',returned:'أُعيدت للتعديل',rejected:'مرفوضة',cancelled:'ملغاة'};

export default function ApprovalsPage(){
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
    if(!detail?.can_route){setRouteDestinations([]);return;}
    let alive=true;
    supabase.rpc('fn_approval_route_destinations').then(({data,error:rpcError})=>{
      if(!alive)return;if(rpcError)setError(rpcError.message||'تعذر تحميل جهات التعميد.');else setRouteDestinations(data||[]);
    });
    return()=>{alive=false;};
  },[detail?.can_route,selectedId]);

  useEffect(()=>{
    if(!routeDestination){setRouteUsers([]);setNextUser('');return;}
    let alive=true;setNextUser('');
    supabase.rpc('fn_admin_procedure_target_users',{p_destination_key:routeDestination}).then(({data,error:rpcError})=>{
      if(!alive)return;if(rpcError){setRouteUsers([]);setError(rpcError.message||'تعذر تحميل مستخدمي جهة التعميد.');}else setRouteUsers(data||[]);
    });
    return()=>{alive=false;};
  },[routeDestination]);

  const selected=useMemo(()=>rows?.find(row=>row.workflow_id===selectedId)||null,[rows,selectedId]);

  async function decide(decision,{route=false}={}){
    if(!selectedId)return;const clean=note.trim();
    if(decision!=='approve'&&!clean){setError('اكتب سبب الإرجاع أو الرفض قبل تنفيذ القرار.');return;}
    if(route&&(!routeDestination||!nextUser)){setError('اختر بوابة التعميد والشخص الذي ستُحال إليه المعاملة.');return;}
    if(route&&!nextReason.trim()){setError('اكتب سبب الإحالة للتعميد.');return;}
    const action=route?'route':decision;setBusy(action);setError('');setMessage('');
    const{error:rpcError}=await supabase.rpc('fn_approval_decide',{
      p_workflow_id:selectedId,p_decision:decision,p_comment:clean||null,
      p_next_user_id:route?nextUser:null,p_next_capability:null,p_next_reason:route?nextReason.trim():null,
    });
    if(rpcError)setError(rpcError.message||'تعذر تنفيذ القرار.');
    else{
      setMessage(route?'تم اعتماد المرحلة الحالية وإحالة المعاملة للتعميد التالي.':decision==='approve'?'تم اعتماد المعاملة نهائيًا.':decision==='return'?'تم إرجاع المعاملة للتعديل.':'تم رفض المعاملة.');
      setNote('');setRouteDestination('');setRouteUsers([]);setNextUser('');setNextReason('');await load();
    }
    setBusy('');
  }

  if(rows===null)return <ConstitutionPage><EmptyState title="جارٍ تحميل الاعتمادات" description="يتم جمع المعاملات التي تحتاج قرارك الآن."/></ConstitutionPage>;
  const workflow=detail?.workflow||null,steps=detail?.steps||[],events=detail?.events||[];

  return <ConstitutionPage>
    <PageHeader eyebrow="العمل" title="الاعتمادات" description="المكان الوحيد لاتخاذ القرار: اعتماد نهائي، إحالة للتعميد، إرجاع للتعديل، أو رفض."/>
    {error?<Notice tone="warning">{error}</Notice>:null}{message?<Notice tone="success">{message}</Notice>:null}
    <div className={styles.shell}>
      <Section title="بانتظار قراري" description={`${rows.length} معاملة تحتاج إجراء`}>
        {rows.length===0?<EmptyState title="لا توجد اعتمادات بانتظارك" description="ستظهر هنا أي معاملة فور وصول مرحلة اعتماد إليك أو إلى صلاحية تملكها."/>:<div className={styles.list}>{rows.map(row=><button type="button" key={row.workflow_id} className={`${styles.item} ${row.workflow_id===selectedId?styles.active:''}`} onClick={()=>setSelectedId(row.workflow_id)}><div className={styles.itemHead}><strong>{row.label_ar||row.transaction_type}</strong><span>{row.workflow_no||'—'}</span></div><div className={styles.title}>{row.source_label||'معاملة'}</div><div className={styles.meta}><span>{row.origin_group_label||'—'}</span><span>{row.target_group_label||'—'}</span><span>{moneyOrDash(row.amount)}</span></div><small>{dateTimeAr(row.submitted_at)}</small></button>)}</div>}
      </Section>

      <div className={styles.detail}>
        {!selected?<EmptyState title="اختر معاملة" description="اختر معاملة من القائمة لعرض مسارها واتخاذ القرار."/>:!workflow?<EmptyState title="جارٍ قراءة المعاملة" description="يتم تحميل تفاصيل النسخة الحالية وسجل القرارات."/>:<Section title={workflow.source_label||selected.label_ar||'معاملة اعتماد'} description={`${workflow.workflow_no||'—'} · النسخة ${workflow.version_no||1}`}>
          <div className={styles.summary}><div><span>الحالة</span><strong>{WORKFLOW_STATUS[workflow.status]||workflow.status||'—'}</strong></div><div><span>المصدر</span><strong>{workflow.origin_group_label||'—'}</strong></div><div><span>المبلغ</span><strong>{moneyOrDash(workflow.amount)}</strong></div></div>

          <div className={styles.block}><h3>مسار الاعتماد</h3>{steps.length===0?<div className={styles.muted}>لا توجد خطوات مسجلة.</div>:<div className={styles.timeline}>{steps.map(step=><div className={styles.event} key={step.id}><div className={styles.eventHead}><strong>الخطوة {step.step_order} · {step.target_group_label||(step.target_type==='user'?'شخص محدد':'الجهة المختصة')}</strong><span>{STEP_STATUS[step.status]||step.status}</span></div>{step.request_reason?<div>{step.request_reason}</div>:null}{step.decision_comment?<div>{step.decision_comment}</div>:null}{step.acted_at?<small>{dateTimeAr(step.acted_at)}</small>:null}</div>)}</div>}</div>

          {events.length?<div className={styles.block}><h3>سجل الحركة</h3><div className={styles.timeline}>{events.map((event,index)=><div className={styles.event} key={`${event.created_at}-${index}`}><div className={styles.eventHead}><strong>{event.event_type}</strong><span>{dateTimeAr(event.created_at)}</span></div>{event.note?<div>{event.note}</div>:null}</div>)}</div></div>:null}

          {detail?.can_act&&workflow.status==='pending'?<div className={styles.block}>
            <h3>القرار</h3>
            <label className={styles.field}>الملاحظة / التبرير<textarea value={note} onChange={event=>setNote(event.target.value)} rows={4} maxLength={2000} placeholder="التبرير إلزامي عند الإرجاع أو الرفض"/></label>
            <div className={styles.actions}>
              <button className="btn" type="button" disabled={Boolean(busy)} onClick={()=>decide('approve')}>{busy==='approve'?'جارٍ الاعتماد…':'اعتماد نهائي'}</button>
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={()=>decide('return')}>{busy==='return'?'جارٍ الإرجاع…':'إرجاع للتعديل'}</button>
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={()=>decide('reject')}>{busy==='reject'?'جارٍ الرفض…':'رفض'}</button>
            </div>

            {detail?.can_route?<div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--raw-line, #ddd)',display:'grid',gap:10}}>
              <h3 style={{margin:0}}>اعتماد وإحالة للتعميد</h3>
              <div className="form-grid">
                <div className="field"><label>بوابة التعميد</label><select value={routeDestination} onChange={e=>setRouteDestination(e.target.value)}><option value="">اختر البوابة</option>{routeDestinations.map(d=><option key={d.destination_key} value={d.destination_key}>{d.label_ar}</option>)}</select></div>
                <div className="field"><label>المعتمد التالي</label><select value={nextUser} onChange={e=>setNextUser(e.target.value)} disabled={!routeDestination}><option value="">اختر الشخص</option>{routeUsers.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name_ar}{u.is_system_admin?' — مدير النظام':''}</option>)}</select></div>
                <div className="field span2"><label>سبب الإحالة</label><input value={nextReason} onChange={e=>setNextReason(e.target.value)} maxLength={1000} placeholder="مثال: للتعميد النهائي قبل الصرف"/></div>
              </div>
              <div><button className="btn" type="button" disabled={Boolean(busy)||!nextUser||!nextReason.trim()} onClick={()=>decide('approve',{route:true})}>{busy==='route'?'جارٍ الإحالة…':'اعتماد المرحلة وإرسالها للتعميد'}</button></div>
            </div>:null}
          </div>:<div className={styles.block}><div className={styles.muted}>هذه المعاملة للمتابعة فقط أو لم تعد بانتظار قرارك.</div></div>}
        </Section>}
      </div>
    </div>
  </ConstitutionPage>;
}
