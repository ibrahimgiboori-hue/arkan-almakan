'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  deleteExternalAttendanceImport,
  getExternalAttendanceImportById,
  listRecentExternalAttendanceImports,
} from '@/lib/adapters/external-attendance-supabase';
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
      try{
        const explicit=searchParams.get('batch')||'';
        const remembered=getCurrentExternalImportId();
        let id=explicit;

        const externalStage=pathname?.startsWith('/dashboard/attendance/external-review')
          || pathname?.startsWith('/dashboard/attendance/payroll')
          || pathname?.startsWith('/dashboard/attendance/manual-resolution');

        if(!id&&externalStage)id=remembered;

        if(id){
          const item=await getExternalAttendanceImportById(id);
          if(alive&&item)setBatch(item);
          return;
        }

        if(pathname==='/dashboard/attendance'){
          const items=await listRecentExternalAttendanceImports(2);
          if(alive&&items.length===1)setBatch(items[0]);
        }
      }catch(e){if(alive)setError(e.message||String(e));}
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
    try{
      await deleteExternalAttendanceImport(batch.id);
      clearCurrentExternalImportId(batch.id);
      setBatch(null);
      router.replace('/dashboard/attendance');
      router.refresh();
      setTimeout(()=>{ if(typeof window!=='undefined') window.location.reload(); },120);
    }catch(e){setError(e.message||String(e));}
    setBusy(false);
  }

  if(!batch)return null;
  return <div style={{display:'flex',alignItems:'center',gap:8,marginInlineStart:'auto',flexWrap:'wrap'}}>
    <button type="button" className="btn ghost" onClick={removeBatch} disabled={busy} style={{borderColor:'#b42318',color:'#b42318'}} title={labelOf(batch)}>
      {busy?'جارٍ الحذف…':'حذف الدفعة'}
    </button>
    {error&&<span style={{fontSize:12,color:'#b42318'}}>{error}</span>}
  </div>;
}
