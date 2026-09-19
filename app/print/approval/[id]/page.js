'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import ApprovalRecordPrint from '@/components/print/ApprovalRecordPrint';

export default function ApprovalRecordPrintPage(){
  const { id }=useParams();
  const search=useSearchParams();
  const mode=search.get('mode')==='decision'?'decision':'incoming';
  const [detail,setDetail]=useState(null);
  const [settings,setSettings]=useState(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const [detailQ,settingsQ]=await Promise.all([
        supabase.rpc('fn_approval_get',{p_workflow_id:id}),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      ]);
      if(cancelled)return;
      if(detailQ.error||!detailQ.data){
        setError(detailQ.error?.message||'تعذر قراءة نسخة المعاملة.');
        return;
      }
      setDetail(detailQ.data);
      setSettings(settingsQ.data||{});
    })();
    return()=>{cancelled=true;};
  },[id]);

  if(error)return <div style={{padding:40,direction:'rtl'}}>{error}</div>;
  if(!detail||!settings)return <div style={{padding:40,direction:'rtl'}}>جارٍ تجهيز نسخة المعاملة…</div>;

  return <>
    <div className="print-toolbar no-print">
      <button type="button" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
      <a href={`/print/approval/${id}?mode=incoming`}>النسخة الواردة</a>
      <a href={`/print/approval/${id}?mode=decision`}>نسخة القرار</a>
      <span>{mode==='decision'?'تتضمن هذه النسخة القرارات والتهميشات المسجلة.':'هذه هي اللقطة التي أُرسلت للاعتماد.'}</span>
    </div>

    <ConstitutionPrintFrame documentKey="approval_record" cfg={settings} direction="rtl">
      <ApprovalRecordPrint detail={detail} mode={mode}/>
    </ConstitutionPrintFrame>
  </>;
}
