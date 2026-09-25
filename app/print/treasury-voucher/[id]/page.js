'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TreasuryVoucherPrint from '@/components/print/TreasuryVoucherPrint';

export default function TreasuryVoucherPrintPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, voucher:null, settings:null, error:'' });
  const [embed, setEmbed] = useState(false);

  useEffect(() => {
    setEmbed(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1');
  }, []);

  useEffect(() => {
    let cancelled=false;
    async function load(){
      setState((current)=>({...current,loading:true,error:''}));
      const [voucherQ,settingsQ]=await Promise.all([
        supabase.rpc('fn_cash_voucher_print_get',{p_voucher_id:id}),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      ]);
      if(cancelled)return;
      const firstError=voucherQ.error||settingsQ.error;
      if(firstError){
        setState({loading:false,voucher:null,settings:null,error:firstError.message||'تعذّر تحميل السند.'});
        return;
      }
      if(!voucherQ.data){
        setState({loading:false,voucher:null,settings:null,error:'لم يُعثر على السند، أو لا تملك صلاحية عرضه.'});
        return;
      }
      setState({
        loading:false,
        voucher:voucherQ.data,
        settings:settingsQ.data||{},
        error:'',
      });
    }
    load();
    return()=>{cancelled=true;};
  },[id]);

  if(state.error)return <div style={{padding:40,direction:'rtl',color:'#b42318'}}>{state.error}</div>;
  if(state.loading)return <div style={{padding:40,direction:'rtl'}}>جارٍ تجهيز السند…</div>;

  return <div data-print-family="treasury_vouchers" data-specialized-template="true" style={{minHeight:'100vh',background:embed?'#fff':'#ececec',direction:'rtl'}}>
    {!embed?<div className="no-print" style={{
      position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
      padding:'10px 16px',background:'#fff',borderBottom:'1px solid #ddd',
    }}>
      <div>
        <strong>{state.voucher?.voucher_type==='receipt'?'سند قبض':'سند صرف'}</strong>
        <span style={{marginInlineStart:10,fontSize:12,color:'#666'}}>قالب سند مالي مخصص — مطابق لخريطة المواضع المعتمدة</span>
      </div>
      <button type="button" onClick={()=>window.print()} style={{padding:'7px 12px',fontWeight:700}}>طباعة / حفظ PDF</button>
    </div>:null}

    <main style={{
      width:'297mm',height:'210mm',margin:embed?'0 auto':'18px auto',
      background:'#fff',boxShadow:embed?'none':'0 6px 28px rgba(0,0,0,.18)',overflow:'hidden',boxSizing:'border-box',
    }}>
      <TreasuryVoucherPrint voucher={state.voucher} settings={state.settings||{}}/>
    </main>
  </div>;
}
