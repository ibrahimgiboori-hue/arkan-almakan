'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  EXTERNAL_IMPORT_CHANGE_EVENT,
  getCurrentExternalImportId,
} from '@/lib/attendance/current-external-import';
import { externalPayrollReportService } from '@/lib/application/external-payroll-report-service';

export default function ExternalPayrollReportShortcut(){
  const [importId,setImportId]=useState('');
  const [run,setRun]=useState(null);

  useEffect(()=>{
    setImportId(getCurrentExternalImportId());
    const onChange=(event)=>setImportId(String(event?.detail?.id||getCurrentExternalImportId()||''));
    window.addEventListener(EXTERNAL_IMPORT_CHANGE_EVENT,onChange);
    return()=>window.removeEventListener(EXTERNAL_IMPORT_CHANGE_EVENT,onChange);
  },[]);

  useEffect(()=>{
    let alive=true;
    setRun(null);
    if(!importId)return()=>{alive=false;};
    externalPayrollReportService.findRunByImport(importId)
      .then((value)=>{if(alive)setRun(value||null);})
      .catch(()=>{if(alive)setRun(null);});
    return()=>{alive=false;};
  },[importId]);

  if(!run?.id||run.status!=='calculated')return null;

  return <Link
    href={`/print/external-payroll/${run.id}`}
    target="_blank"
    rel="noreferrer"
    className="no-print"
    style={{
      position:'fixed',left:22,bottom:22,zIndex:120,
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      padding:'10px 14px',borderRadius:8,textDecoration:'none',
      background:'#24364B',color:'#fff',fontWeight:800,fontSize:13,
      boxShadow:'0 8px 24px rgba(15,23,42,.18)',
    }}
  >
    مسير الرواتب PDF / Excel
  </Link>;
}
