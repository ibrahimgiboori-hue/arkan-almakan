'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function LegacyExternalPayslipRedirect(){
  const params=useParams();
  const batchId=encodeURIComponent(String(params?.batchId||''));
  const lineId=encodeURIComponent(String(params?.lineId||''));

  useEffect(()=>{
    if(!batchId||!lineId)return;
    window.location.replace(`/print/external-payroll/${batchId}/payslip/${lineId}`);
  },[batchId,lineId]);

  return <main style={{padding:24,direction:'rtl'}}>جارٍ فتح قسيمة الراتب…</main>;
}
