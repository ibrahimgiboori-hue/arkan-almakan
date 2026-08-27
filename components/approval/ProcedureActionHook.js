'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureActionHook.module.css';

const STATUS_LABELS={new:'جديد',received:'مستلم',in_progress:'قيد التنفيذ',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',cancelled:'ملغى',pending:'قيد الاعتماد',approved:'معتمد',returned:'معاد',rejected:'مرفوض'};
const ACTION_LABELS={review:'مراجعة',approve:'اعتماد',authorize:'تعميد',issue:'إصدار',create:'إنشاء',forward:'إحالة'};
const money=new Intl.NumberFormat('ar-SA',{minimumFractionDigits:0,maximumFractionDigits:2});

export default function ProcedureActionHook({
  capabilityKey,sourceTable,sourceId,sourceLabel,amount=0,currentDestinationKey,scopeType='all',scopeKey=null,projectId=null,
}){
  const [stateRows,setStateRows]=useState([]);
  const [runtime,setRuntime]=useState(null);
  const [options,setOptions]=useState(null);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState('menu');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [note,setNote]=useState('');
  const [settledDraft,setSettledDraft]=useState('');

  const loadState=useCallback(async()=>{
    if(!sourceId)return;
    const [procedureQ,runtimeQ]=await Promise.all([
      supabase.rpc('fn_transaction_procedure_state',{p_source_table:sourceTable,p_source_id:sourceId}),
      supabase.rpc('fn_procedure_runtime_state',{p_source_table:sourceTable,p_source_id:sourceId}),
    ]);
    if(!procedureQ.error)setStateRows(procedureQ.data||[]);
    if(!runtimeQ.error){
      setRuntime(runtimeQ.data||null);
      if(runtimeQ.data?.settled_amount!==undefined)setSettledDraft(String(runtimeQ.data.settled_amount||0));
    }
  },[sourceId,sourceTable]);
  useEffect(()=>{loadState();},[loadState]);

  const live=useMemo(()=>stateRows.find(row=>!['completed','closed','cancelled','approved','rejected'].includes(String(row.status||'')))||stateRows[0]||null,[stateRows]);

  async function openActions(){
    setError('');setMessage('');setMode('menu');setOpen(true);setOptions(null);setNote('');
    if(live){setOptions([]);return;}
    const {data,error:rpcError}=await supabase.rpc('fn_procedure_route_options',{
      p_capability_key:capabilityKey,
      p_current_destination_key:currentDestinationKey||null,
      p_scope_type:scopeType,
      p_scope_key:scopeKey,
      p_amount:Number(amount||runtime?.original_amount||0),
    });
    if(rpcError){setError(rpcError.message||'تعذر قراءة مسار الإجراء.');setOptions([]);return;}
    setOptions(data||[]);
  }

  async function createAction(option){
    setBusy(true);setError('');setMessage('');
    const {error:rpcError}=await supabase.rpc('fn_create_procedure_action',{
      p_capability_key:capabilityKey,
      p_source_table:sourceTable,
      p_source_id:sourceId,
      p_source_label:sourceLabel,
      p_current_destination_key:currentDestinationKey||null,
      p_destination_key:option.destination_key,
      p_scope_type:scopeType,
      p_scope_key:scopeKey,
      p_amount:Number(amount||runtime?.original_amount||0),
      p_project_id:projectId,
      p_note:null,
      p_source_route:typeof window!=='undefined'?window.location.pathname:null,
      p_target_user_id:null,
    });
    if(rpcError)setError(rpcError.message||'تعذر إنشاء الإجراء.');
    else{setMessage('تم توجيه المعاملة للاعتماد.');setMode('menu');await loadState();}
    setBusy(false);
  }

  async function runtimeAction(action,{actionNote=null,settledAmount=null}={}){
    if(!runtime){setError('هذه المعاملة لم تدخل بعد فهرس الإجراءات التلقائي.');return;}
    setBusy(true);setError('');setMessage('');
    const {data,error:rpcError}=await supabase.rpc('fn_procedure_runtime_action',{
      p_source_table:sourceTable,
      p_source_id:sourceId,
      p_action:action,
      p_note:actionNote,
      p_settled_amount:settledAmount,
    });
    if(rpcError)setError(rpcError.message||'تعذر تنفيذ الإجراء.');
    else{
      setRuntime(data||runtime);
      if(data?.settled_amount!==undefined)setSettledDraft(String(data.settled_amount||0));
      setNote('');setMode('menu');
      setMessage(action==='completed'?'تم الإجراء وحُفظت حالة المعاملة.':action==='inquiry_open'?'تم تسجيل الاستفسار دون إغلاق المعاملة.':'تم تحديث التسوية المالية.');
    }
    setBusy(false);
  }

  const targetText=live?(live.target_user_name||live.target_portal_key||live.target_capability||'الجهة المختصة'):null;
  const runtimeDone=runtime?.procedure_status==='done';
  const inquiryOpen=runtime?.inquiry_status==='open';
  return <div className={styles.root} data-entry-ignore="true">
    <div className={styles.stateLine}>
      {runtime?<><strong>{runtimeDone?'تم الإجراء':'تحت المعالجة'}</strong>{inquiryOpen?<span>· استفسار مفتوح</span>:null}{live?<span>· لدى {targetText}</span>:null}</>:live?<><strong>{STATUS_LABELS[live.status]||live.status||'قيد الإجراء'}</strong><span>· لدى {targetText}</span></>:<><strong>لم يبدأ مسار إجراء</strong><span>· المعاملة بلا جهة اعتماد حالية</span></>}
      {live?.due_at?<small>· حتى {new Date(live.due_at).toLocaleString('ar-SA')}</small>:null}
      {runtime?.financial_effect?<small>· {money.format(Number(runtime.original_amount||0))} ر.س · مسوّى {money.format(Number(runtime.settled_amount||0))} · متبقٍ {money.format(Number(runtime.outstanding_amount||0))}</small>:null}
    </div>
    <button className={styles.hook} type="button" onClick={openActions} disabled={busy}>إجراء</button>
    {message?<small className={styles.success}>{message}</small>:null}
    {open?<div className={styles.popover}>
      <div className={styles.popHead}><strong>إجراء المعاملة</strong><button type="button" onClick={()=>setOpen(false)}>×</button></div>
      {error?<div className={styles.error}>{error}</div>:null}

      {mode==='menu'?<>
        <button className={styles.option} type="button" disabled={busy||!runtime||runtimeDone} onClick={()=>runtimeAction('completed')}>
          <span><strong>تم الإجراء</strong><small>هو الخيار الوحيد الذي يقفل حالة الإجراء الحالية.</small></span><em>{runtimeDone?'مكتمل':'تنفيذ'}</em>
        </button>
        <button className={styles.option} type="button" disabled={busy||Boolean(live)} onClick={()=>setMode('route')}>
          <span><strong>توجيه للاعتماد</strong><small>{live?'يوجد توجيه مفتوح بالفعل.':'يرسل المعاملة للجهة التالية دون إغلاقها.'}</small></span><em>توجيه</em>
        </button>
        <button className={styles.option} type="button" disabled={busy||!runtime} onClick={()=>setMode('inquiry')}>
          <span><strong>استفسار</strong><small>يسجل سؤالًا على المعاملة وتبقى تحت المعالجة.</small></span><em>{inquiryOpen?'مفتوح':'سؤال'}</em>
        </button>
        {runtime?.financial_effect?<div style={{borderTop:'1px solid var(--ui-border,#ddd)',marginTop:8,paddingTop:10,display:'grid',gap:7}}>
          <strong>التسوية المالية</strong>
          <small>إجمالي {money.format(Number(runtime.original_amount||0))} ر.س · المتبقي {money.format(Number(runtime.outstanding_amount||0))} ر.س</small>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <input type="number" min="0" max={Number(runtime.original_amount||0)} step="0.01" value={settledDraft} onChange={e=>setSettledDraft(e.target.value)} placeholder="المبلغ الذي تمت تسويته" style={{minWidth:0,flex:1}}/>
            <button type="button" disabled={busy} onClick={()=>runtimeAction('set_settled_amount',{settledAmount:Number(settledDraft||0)})}>حفظ</button>
            <button type="button" disabled={busy||Number(runtime.outstanding_amount||0)<=0} onClick={()=>runtimeAction('settle')}>تسوية كاملة</button>
          </div>
        </div>:null}
      </>:null}

      {mode==='route'?<>
        <button type="button" onClick={()=>setMode('menu')}>رجوع</button>
        {options===null?<div className={styles.muted}>جارٍ قراءة دستور الحركة…</div>:options.length?options.map(option=><button key={`${option.option_kind}-${option.destination_key}-${option.target_capability||''}`} className={styles.option} type="button" disabled={busy} onClick={()=>createAction(option)}>
          <span><strong>{ACTION_LABELS[option.action_type]||option.action_type||'إجراء'} — {option.destination_label_ar}</strong><small>{option.reason}</small></span><em>{option.is_mandatory?'إلزامي':'مسموح'}</em>
        </button>):<div className={styles.unclassified}><strong>لا توجد وجهة متاحة لهذه العملية.</strong><span>إما أن هناك توجيهًا مفتوحًا أو أن العملية لم تُصنّف بعد.</span><Link href="/dashboard/workspace/admin/section/procedure-routes">فتح دستور الحركة</Link></div>}
      </>:null}

      {mode==='inquiry'?<div style={{display:'grid',gap:8}}>
        <button type="button" onClick={()=>setMode('menu')}>رجوع</button>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="اكتب الاستفسار بوضوح…"/>
        <button type="button" disabled={busy||!note.trim()} onClick={()=>runtimeAction('inquiry_open',{actionNote:note.trim()})}>إرسال الاستفسار</button>
        {inquiryOpen?<button type="button" disabled={busy} onClick={()=>runtimeAction('inquiry_answered')}>تم الرد على الاستفسار</button>:null}
      </div>:null}
    </div>:null}
  </div>;
}
