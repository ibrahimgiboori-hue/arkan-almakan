'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearCurrentExternalImportId, getCurrentExternalImportId } from '@/lib/attendance/current-external-import';

function labelOf(item){
  if(!item)return '';
  const name=item.client_name_snapshot||'دفعة خارجية';
  const from=String(item.period_from||'').slice(0,10);
  const to=String(item.period_to||'').slice(0,10);
  return `${name}${from&&to?` — ${from} إلى ${to}`:''}`;
}

export default function DeleteExternalAttendanceBatchButton(){
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const router=useRouter();
  const [batch,setBatch]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    async function resolveBatch(){
      setBatch(null);setError('');
      const explicit=searchParams.get('batch')||'';
      const remembered=getCurrentExternalImportId();
      let id=explicit;

      const externalStage=pathname?.startsWith('/dashboard/attendance/external-review')
        || pathname?.startsWith('/dashboard/attendance/payroll')
        || pathname?.startsWith('/dashboard/attendance/manual-resolution');

      if(!id&&externalStage)id=remembered;

      if(id){
        const q=await supabase.from('hr_attendance_imports')
          .select('id,client_name_snapshot,period_from,period_to,processing_scope')
          .eq('id',id).eq('processing_scope','external').maybeSingle();
        if(alive&&!q.error&&q.data)setBatch(q.data);
        return;
      }

      if(pathname==='/dashboard/attendance'){
        const q=await supabase.from('hr_attendance_imports')
          .select('id,client_name_snapshot,period_from,period_to,processing_scope')
          .eq('processing_scope','external')
          .order('uploaded_at',{ascending:false}).limit(2);
        if(alive&&!q.error&&(q.data||[]).length===1)setBatch(q.data[0]);
      }
    }
    resolveBatch();
    return()=>{alive=false;};
  },[pathname,searchParams]);

  async function removeBatch(){
    if(!batch||busy)return;
    const label=labelOf(batch);
    const ok=window.confirm(`حذف «${label}» نهائيًا؟\n\nسيتم حذف الحضور والحركات والمعايرة والتبريرات والقرارات وأي رواتب مرتبطة بهذه الدفعة. لا يمكن التراجع.`);
    if(!ok)return;
    setBusy(true);setError('');
    const q=await supabase.rpc('hr_delete_external_attendance_import',{p_import_id:batch.id});
    if(q.error){setBusy(false);setError(q.error.message);return;}
    clearCurrentExternalImportId(batch.id);
    setBatch(null);setBusy(false);
    router.replace('/dashboard/attendance');
    router.refresh();
    setTimeout(()=>{ if(typeof window!=='undefined') window.location.reload(); },120);
  }

  if(!batch)return null;
  return <div style={{display:'flex',alignItems:'center',gap:8,marginInlineStart:'auto',flexWrap:'wrap'}}>
    <button type="button" className="btn ghost" onClick={removeBatch} disabled={busy} style={{borderColor:'#b42318',color:'#b42318'}} title={labelOf(batch)}>
      {busy?'جارٍ الحذف…':'حذف الدفعة'}
    </button>
    {error&&<span style={{fontSize:12,color:'#b42318'}}>{error}</span>}
  </div>;
}
