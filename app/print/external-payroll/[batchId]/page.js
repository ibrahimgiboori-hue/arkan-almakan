'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import ExternalPayrollRunReport from '@/components/print/ExternalPayrollRunReport';
import { externalPayrollReportService } from '@/lib/application/external-payroll-report-service';
import { downloadExternalPayrollExcel } from '@/lib/export/external-payroll-excel';

export default function ExternalPayrollRunPrintPage(){
  const params=useParams();
  const batchId=String(params?.batchId||'');
  const [payload,setPayload]=useState(null);
  const [loading,setLoading]=useState(true);
  const [exporting,setExporting]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(!batchId)return;
      setLoading(true);setError('');
      try{
        const result=await externalPayrollReportService.loadRun(batchId);
        if(alive)setPayload(result);
      }catch(err){
        if(alive)setError(err?.message||String(err));
      }finally{
        if(alive)setLoading(false);
      }
    })();
    return()=>{alive=false;};
  },[batchId]);

  async function exportExcel(){
    if(!payload?.report||exporting)return;
    setExporting(true);setError('');
    try{
      await downloadExternalPayrollExcel(payload.report);
    }catch(err){
      setError(err?.message||String(err));
    }finally{
      setExporting(false);
    }
  }

  if(loading)return <main style={{padding:24,direction:'rtl'}}>جارٍ تجهيز مسير الرواتب…</main>;
  if(error&&!payload?.report)return <main style={{padding:24,direction:'rtl'}}>تعذر تجهيز مسير الرواتب: {error}</main>;
  if(!payload?.report)return <main style={{padding:24,direction:'rtl'}}>مسير الرواتب غير متاح.</main>;
  if(payload.report.uncalculatedCount>0)return <main style={{padding:24,direction:'rtl'}}>المسير غير جاهز للطباعة. يوجد {payload.report.uncalculatedCount} موظف لم يكتمل احتساب راتبه.</main>;

  const letterheadPath=String(payload.source?.batch?.client_letterhead_path||'').trim();
  const captainCfg=letterheadPath&&!/^https?:\/\//i.test(letterheadPath)?{letterhead_image_path:letterheadPath}:null;

  return <div dir="rtl">
    <div className="no-print" style={{display:'flex',gap:8,justifyContent:'center',alignItems:'center',flexWrap:'wrap',margin:'8px auto 10px'}}>
      <button type="button" onClick={()=>window.close()} style={{border:'1px solid #aaa',background:'#fff',padding:'6px 10px',font:'inherit',fontSize:12,cursor:'pointer'}}>إغلاق</button>
      <button type="button" disabled={exporting} onClick={exportExcel} style={{border:'1px solid #24364B',background:'#fff',color:'#24364B',padding:'6px 10px',font:'inherit',fontSize:12,cursor:exporting?'wait':'pointer',fontWeight:700}}>{exporting?'جارٍ تجهيز Excel…':'تنزيل التقرير الشامل Excel'}</button>
      <button type="button" onClick={()=>window.print()} style={{border:'1px solid #8B3332',background:'#8B3332',color:'#fff',padding:'6px 10px',font:'inherit',fontSize:12,cursor:'pointer'}}>طباعة / حفظ PDF المختصر</button>
    </div>
    {error&&<div className="no-print" style={{maxWidth:900,margin:'0 auto 8px',padding:'7px 10px',border:'1px solid #b45309',background:'#fff7ed',color:'#7c2d12',fontSize:12}}>{error}</div>}

    <ConstitutionPrintFrame
      documentKey="payroll_run"
      cfg={captainCfg}
      direction="rtl"
      renderOverlay={letterheadPath&&/^https?:\/\//i.test(letterheadPath)?()=> <img src={letterheadPath} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'fill',pointerEvents:'none',zIndex:0}}/>:undefined}
    >
      <div className="print-document" dir="rtl">
        <ExternalPayrollRunReport report={payload.report}/>
      </div>
    </ConstitutionPrintFrame>
  </div>;
}
