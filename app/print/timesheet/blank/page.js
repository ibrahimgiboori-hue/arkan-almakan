'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';
import '../timesheet-report.css';
import './blank-timesheet.css';

const LAYOUT=getPrintLayoutPolicy('timesheet_blank');
const rows=Array.from({length:16},(_,index)=>index+1);
const WEEK_DAYS=['السبت','الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس'];

export default function BlankContractorTimesheet(){
  const [cfg,setCfg]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{(async()=>{
    let query=await supabase.from('app_settings').select('company_name_ar,letterhead_image_path,header_image_path,footer_image_path,watermark_image_path,header_height_mm,footer_height_mm,letterhead_top_mm,letterhead_bottom_mm,letterhead_side_mm').eq('id',1).maybeSingle();
    if(query.error)query=await supabase.rpc('fn_portal_print_settings');
    if(query.error||!query.data)setError('تعذر تحميل هوية المطبوع.');else setCfg(query.data);
  })();},[]);
  if(error)return <div className="timesheet-print-loading error">{error}</div>;
  if(!cfg)return <div className="timesheet-print-loading">جارٍ إعداد النموذج العام…</div>;
  return <>
    <div className="timesheet-print-toolbar no-print"><button type="button" className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button><span>نموذج تايم شيت أسبوعي فارغ — من السبت إلى الخميس</span></div>
    <ConstitutionPagedFrame documentKey="timesheet_blank" cfg={cfg} contentTopMm={LAYOUT.topMm} contentBottomMm={LAYOUT.bottomMm} contentSideMm={LAYOUT.sideMm} showPageNumbers={false}>
      <div className="ts-page ts-blank-page">
        <div className="ts-doc-title"><h1>نموذج تايم شيت أسبوعي</h1><span/></div>
        <table className="ts-info-table ts-blank-info"><tbody>
          <tr><th>المشروع</th><td>....................................................................................................</td><th>المقاول</th><td>....................................................................</td></tr>
          <tr><th>الموقع</th><td>....................................................................................................</td><th>الأسبوع</th><td>من ........ / ........ / ............ إلى ........ / ........ / ............</td></tr>
        </tbody></table>
        <div className="ts-paper-instruction">يكتب اسم العامل وصفته، ثم تسجل حالة الحضور في كل يوم: ✓ يوم كامل أو ½ نصف يوم، ويترك الغائب بلا علامة.</div>
        <table className="ts-table ts-blank-table">
          <colgroup><col className="blank-index"/><col className="blank-name"/><col className="blank-role"/>{WEEK_DAYS.map(day=><col key={day} className="blank-day"/>)}<col className="blank-notes"/></colgroup>
          <thead><tr><th>م</th><th>اسم العامل</th><th>صفته</th>{WEEK_DAYS.map(day=><th key={day}><span>{day}</span><small>التاريخ: ____ / ____</small></th>)}<th>ملاحظات</th></tr></thead>
          <tbody>{rows.map(index=><tr key={index}><td>{index}</td><td/><td/><>{WEEK_DAYS.map(day=><td key={day}/>)}</><td/></tr>)}</tbody>
          <tfoot><tr><th colSpan={3}>إجمالي اليوميات لكل يوم</th>{WEEK_DAYS.map(day=><th key={day}>........</th>)}<th/></tr></tfoot>
        </table>
        <div className="ts-paper-count">يوميات الصنايعية: ............ · يوميات العمال: ............ · إجمالي اليوميات: ............</div>
        <div className="ts-signatures"><div><b>مشرف الموقع</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div><div><b>مسؤول المقاول</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div></div>
      </div>
    </ConstitutionPagedFrame>
  </>;
}
