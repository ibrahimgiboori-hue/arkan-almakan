'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_LABELS={new:'جديد',received:'مستلم',in_progress:'قيد التنفيذ',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',cancelled:'ملغى',pending:'قيد الاعتماد',approved:'معتمد',returned:'معاد',rejected:'مرفوض'};
const TERMINAL=new Set(['completed','closed','cancelled','approved','rejected']);

export default function ProcedureSourceControl({
  capabilityKey,sourceTable,sourceId,sourceLabel,amount=0,currentDestinationKey,scopeType='all',scopeKey=null,projectId=null,
}){
  const [rows,setRows]=useState([]);
  const [options,setOptions]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    if(!sourceId)return;
    const {data,error:stateError}=await supabase.rpc('fn_transaction_procedure_state',{p_source_table:sourceTable,p_source_id:sourceId});
    if(stateError){setError(stateError.message||'تعذر قراءة حالة المعاملة.');return;}
    setRows(data||[]);
  },[sourceId,sourceTable]);

  useEffect(()=>{load();},[load]);

  const live=useMemo(()=>rows.find(row=>!TERMINAL.has(String(row.status||'')))||null,[rows]);
  const last=rows[0]||null;
  const targetText=live?(live.target_user_name||live.target_portal_key||live.target_capability||'الجهة المختصة'):null;

  async function readRoutes(){
    if(live)return;
    setBusy(true);setError('');setMessage('');
    const {data,error:routeError}=await supabase.rpc('fn_procedure_route_options',{
      p_capability_key:capabilityKey,
      p_current_destination_key:currentDestinationKey||null,
      p_scope_type:scopeType,
      p_scope_key:scopeKey,
      p_amount:Number(amount||0),
    });
    if(routeError)setError(routeError.message||'تعذر قراءة مسار الإجراء.');
    else setOptions(data||[]);
    setBusy(false);
  }

  async function send(option){
    setBusy(true);setError('');setMessage('');
    const {error:sendError}=await supabase.rpc('fn_create_procedure_action',{
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
    if(sendError)setError(sendError.message||'تعذر إرسال المعاملة.');
    else{setMessage('تم إرسال المعاملة للمسار المحدد.');setOptions(null);await load();}
    setBusy(false);
  }

  if(live)return <div className="msg" style={{borderColor:'var(--hair-strong)',background:'#fff'}}>
    <strong>{STATUS_LABELS[live.status]||live.status||'قيد الإجراء'}</strong>
    <div style={{marginTop:4}}>المعاملة الآن لدى: <strong>{targetText}</strong></div>
    <div className="hint" style={{marginTop:4}}>من جهة المنشأ لا توجد أزرار قرار طالما المعاملة لدى جهة أخرى.</div>
  </div>;

  return <div style={{display:'grid',gap:10}}>
    {last&&TERMINAL.has(String(last.status||''))?<div className="msg">آخر مسار: <strong>{STATUS_LABELS[last.status]||last.status}</strong></div>:null}
    {error?<div className="msg err">{error}</div>:null}
    {message?<div className="msg ok">{message}</div>:null}
    {options===null?<button className="btn" type="button" onClick={readRoutes} disabled={busy}>{busy?'جارٍ القراءة…':'إرسال للإجراء'}</button>:null}
    {Array.isArray(options)&&options.length===0?<div className="msg">لا يوجد مسار متاح لهذه المعاملة وفق الدستور الحالي.</div>:null}
    {Array.isArray(options)&&options.length>0?<div style={{display:'grid',gap:8}}>
      <div className="hint">اختر المسار المتاح. إذا كان الدستور يقيد البوابة فلن تظهر إلا الوجهة المسموحة.</div>
      {options.map(option=><button key={`${option.destination_key}-${option.target_capability||''}`} className="btn" type="button" disabled={busy} onClick={()=>send(option)}>
        إرسال إلى {option.destination_label_ar||option.destination_key}
      </button>)}
      <button className="btn ghost" type="button" disabled={busy} onClick={()=>setOptions(null)}>إلغاء</button>
    </div>:null}
  </div>;
}
