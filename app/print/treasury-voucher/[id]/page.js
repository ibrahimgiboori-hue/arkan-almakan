'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import TreasuryVoucherPrint from '@/components/print/TreasuryVoucherPrint';

export default function TreasuryVoucherPrintPage(){
  const { id } = useParams();
  const [voucher,setVoucher]=useState(null);
  const [settings,setSettings]=useState(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const [voucherQ,settingsQ]=await Promise.all([
        supabase.rpc('fn_cash_voucher_print_get',{p_voucher_id:id}),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      ]);
      if(cancelled)return;
      if(voucherQ.error||!voucherQ.data){
        setError(voucherQ.error?.message||'لم يُعثر على السند، أو لا تملك صلاحية عرضه.');
        return;
      }
      setVoucher(voucherQ.data);
      setSettings(settingsQ.data||{});
    })();
    return()=>{cancelled=true;};
  },[id]);

  if(error)return <div style={{padding:40,direction:'rtl'}}>{error}</div>;
  if(!voucher||!settings)return <div style={{padding:40,direction:'rtl'}}>جارٍ تجهيز السند…</div>;

  const stampUrl=settings.stamp_image_path
    ? supabase.storage.from('brand').getPublicUrl(settings.stamp_image_path).data.publicUrl
    : '';

  return <>
    <div className="print-toolbar no-print">
      <button type="button" onClick={()=>window.print()}>طباعة / حفظ PDF</button>
      <span>السند داخل قبطان الطباعة: ورقة A4 حاملة، والمستند المصغر مستقل وبدون ليترهيد.</span>
    </div>

    <ConstitutionPrintFrame
      documentKey="treasury_voucher"
      cfg={settings}
      direction="rtl"
    >
      <TreasuryVoucherPrint voucher={voucher} settings={settings} stampUrl={stampUrl}/>
    </ConstitutionPrintFrame>
  </>;
}
