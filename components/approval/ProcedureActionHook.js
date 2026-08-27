'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './ProcedureActionHook.module.css';

const STATUS_LABELS={new:'جديد',received:'مستلم',in_progress:'قيد التنفيذ',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',cancelled:'ملغى',pending:'قيد الاعتماد',approved:'معتمد',returned:'معاد',rejected:'مرفوض'};
const ACTION_LABELS={review:'مراجعة',approve:'اعتماد',authorize:'تعميد',issue:'إصدار',create:'إنشاء',forward:'إحالة'};

export default function ProcedureActionHook({
  capabilityKey,sourceTable,sourceId,sourceLabel,amount=0,currentDestinationKey,scopeType='all',scopeKey=null,projectId=null,
}){
  const [stateRows,setStateRows]=useState([]);
  const [options,setOptions]=useState(null);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const loadState=useCallback(async()=>{
    if(!sourceId)return;
    const {data,error:rpcError}=await supabase.rpc('fn_transaction_procedure_state',{p_source_table:sourceTable,p_source_id:sourceId});
    if(!rpcError)setStateRows(data||[]);
  },[sourceId,sourceTable]);
  useEffect(()=>{loadState();},[loadState]);

  const live=useMemo(()=>stateRows.find(row=>!['completed','closed','cancelled','approved','rejected'].includes(String(row.status||'')))||stateRows[0]||null,[stateRows]);

  async function loadOptions(){
    setError('');setMessage('');setOpen(true);
    const {data,error:rpcError}=await supabase.rpc('fn_procedure_route_options',{
      p_capability_key:capabilityKey,
      p_current_destination_key:currentDestinationKey||null,
      p_scope_type:scopeType,
      p_scope_key:scopeKey,
      p_amount:Number(amount||0),
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
      p_amount:Number(amount||0),
      p_project_id:projectId,
      p_note:null,
      p_source_route:typeof window!=='undefined'?window.location.pathname:null,
      p_target_user_id:null,
    });
    if(rpcError)setError(rpcError.message||'تعذر إنشاء الإجراء.');
    else{setMessage('تم إنشاء الإجراء وإرساله إلى الجهة المحددة.');setOpen(false);setOptions(null);await loadState();}
    setBusy(false);
  }

  const targetText=live?(live.target_user_name||live.target_portal_key||live.target_capability||'الجهة المختصة'):null;
  return <div className={styles.root} data-entry-ignore="true">
    <div className={styles.stateLine}>
      {live?<><strong>{STATUS_LABELS[live.status]||live.status||'قيد الإجراء'}</strong><span>· لدى {targetText}</span>{live.due_at?<small>· حتى {new Date(live.due_at).toLocaleString('ar-SA')}</small>:null}</>:<><strong>لم يبدأ مسار إجراء</strong><span>· المعاملة بلا جهة اعتماد حالية</span></>}
    </div>
    <button className={styles.hook} type="button" onClick={loadOptions} disabled={busy||Boolean(live&&!['completed','closed','cancelled','approved','rejected'].includes(String(live.status||'')))}>{live?'عرض المسار':'إجراء'}</button>
    {message?<small className={styles.success}>{message}</small>:null}
    {open?<div className={styles.popover}>
      <div className={styles.popHead}><strong>سنارة الإجراء</strong><button type="button" onClick={()=>setOpen(false)}>×</button></div>
      {error?<div className={styles.error}>{error}</div>:null}
      {options===null?<div className={styles.muted}>جارٍ قراءة دستور الحركة…</div>:options.length?options.map(option=><button key={`${option.option_kind}-${option.destination_key}-${option.target_capability||''}`} className={styles.option} type="button" disabled={busy} onClick={()=>createAction(option)}>
        <span><strong>{ACTION_LABELS[option.action_type]||option.action_type||'إجراء'} — {option.destination_label_ar}</strong><small>{option.reason}</small></span><em>{option.is_mandatory?'إلزامي':'مسموح'}</em>
      </button>):<div className={styles.unclassified}><strong>لا توجد وجهة متاحة لهذه العملية.</strong><span>غالبًا لم تُصنّف بعد في دستور حركة المعاملات.</span><Link href="/dashboard/workspace/admin/section/procedure-routes">فتح دستور الحركة</Link></div>}
    </div>:null}
  </div>;
}
