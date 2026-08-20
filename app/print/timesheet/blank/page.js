'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';
import '../timesheet-report.css';
import './blank-timesheet.css';

const LAYOUT=getPrintLayoutPolicy('timesheet_blank');
const rows=Array.from({length:15},(_,index)=>index+1);

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
    <div className="timesheet-print-toolbar no-print"><button type="button" className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button><span>نموذج عام وفارغ — صالح لأي مقاول وأي مشروع</span></div>
    <ConstitutionPagedFrame documentKey="timesheet_blank" cfg={cfg} contentTopMm={LAYOUT.topMm} contentBottomMm={LAYOUT.bottomMm} contentSideMm={LAYOUT.sideMm} showPageNumbers={false}>
      <div className="ts-page ts-blank-page">
        <div className="ts-doc-title"><h1>نموذج حضور عمال — تسجيل يدوي</h1><span/></div>
        <table className="ts-info-table ts-blank-info"><tbody>
          <tr><th>المشروع</th><td>................................................................................</td><th>رقم المشروع</th><td>....................................</td></tr>
          <tr><th>المقاول</th><td>................................................................................</td><th>التاريخ</th><td>........ / ........ / ................</td></tr>
          <tr><th>الموقع</th><td>................................................................................</td><th>مشرف الموقع</th><td>....................................</td></tr>
        </tbody></table>
        <div className="ts-paper-instruction">يكتب الاسم الحقيقي والمهنة، ثم توضع ✓ للحضور الكامل أو ½ لنصف اليوم. تُكتب الملاحظة عند الحاجة فقط.</div>
        <table className="ts-table ts-blank-table"><colgroup><col className="blank-index"/><col className="blank-name"/><col className="blank-class"/><col className="blank-trade"/><col className="blank-mark"/><col/></colgroup><thead><tr><th>م</th><th>اسم العامل</th><th>التصنيف</th><th>المهنة</th><th>الحضور</th><th>ملاحظات المشرف</th></tr></thead><tbody>{rows.map(index=><tr key={index}><td>{index}</td><td/><td/><td/><td/><td/></tr>)}</tbody></table>
        <div className="ts-paper-count">الحضور الكامل: ............ · أنصاف الأيام: ............ · مجموع اليوميات: ............</div>
        <div className="ts-signatures"><div><b>مشرف الموقع</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div><div><b>مسؤول المقاول</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div></div>
      </div>
    </ConstitutionPagedFrame>
  </>;
}
