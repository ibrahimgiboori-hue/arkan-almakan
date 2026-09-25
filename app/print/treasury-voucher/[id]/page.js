'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TreasuryVoucherPrint from '@/components/print/TreasuryVoucherPrint';
import TreasuryVoucherExcelPrint from '@/components/print/TreasuryVoucherExcelPrint';
import { inspectPrintFamilyWorkbook } from '@/lib/print-family-workbook-client';
import { PRINT_FAMILIES } from '@/lib/print-family-catalog.mjs';

export default function TreasuryVoucherPrintPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, voucher:null, settings:null, schema:null, error:'' });
  const [embed, setEmbed] = useState(false);

  useEffect(() => {
    setEmbed(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1');
  }, []);

  useEffect(() => {
    let cancelled=false;
    async function load(){
      setState((current)=>({...current,loading:true,error:''}));
      const [voucherQ,settingsQ,familyQ]=await Promise.all([
        supabase.rpc('fn_cash_voucher_print_get',{p_voucher_id:id}),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
        supabase.from('print_family_workbooks').select('ui_schema,version,original_name,storage_path,model_sheets').eq('family_id','treasury_vouchers').maybeSingle(),
      ]);
      if(cancelled)return;
      const firstError=voucherQ.error||settingsQ.error||familyQ.error;
      if(firstError){
        setState({loading:false,voucher:null,settings:null,schema:null,error:firstError.message||'تعذّر تحميل السند.'});
        return;
      }
      if(!voucherQ.data){
        setState({loading:false,voucher:null,settings:null,schema:null,error:'لم يُعثر على السند، أو لا تملك صلاحية عرضه.'});
        return;
      }
      let liveSchema=familyQ.data?.ui_schema||null;

      // Re-read the currently uploaded workbook itself so border visibility,
      // merged spans, row heights and fixed labels stay in lockstep with Excel.
      // The stored ui_schema remains the fallback if the workbook cannot be read.
      if(familyQ.data?.storage_path){
        try{
          const fileQ=await supabase.storage.from('print-families').download(familyQ.data.storage_path);
          if(!fileQ.error && fileQ.data){
            const file=new File(
              [fileQ.data],
              familyQ.data.original_name||'treasury_vouchers.xlsx',
              {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
            );
            const inspection=await inspectPrintFamilyWorkbook(
              file,
              {id:'treasury_vouchers',...(PRINT_FAMILIES.treasury_vouchers||{})},
              {protectedModels:familyQ.data.model_sheets||[]}
            );
            if(!inspection.errors?.length && inspection.uiSchema){
              liveSchema=inspection.uiSchema;
            }
          }
        }catch(_error){
          // Keep the last stored schema as a safe fallback.
        }
      }

      if(cancelled)return;
      setState({
        loading:false,
        voucher:voucherQ.data,
        settings:settingsQ.data||{},
        schema:liveSchema,
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
        <span style={{marginInlineStart:10,fontSize:12,color:'#666'}}>Excel هو مصدر الثوابت والمواضع والمساحات — البيانات من السند</span>
      </div>
      <button type="button" onClick={()=>window.print()} style={{padding:'7px 12px',fontWeight:700}}>طباعة / حفظ PDF</button>
    </div>:null}

    <main style={{
      width:'297mm',height:'210mm',margin:embed?'0 auto':'18px auto',
      background:'#fff',boxShadow:embed?'none':'0 6px 28px rgba(0,0,0,.18)',overflow:'hidden',boxSizing:'border-box',
    }}>
      {state.schema
        ? <TreasuryVoucherExcelPrint voucher={state.voucher} settings={state.settings||{}} schema={state.schema}/>
        : <TreasuryVoucherPrint voucher={state.voucher} settings={state.settings||{}}/>}
    </main>
  </div>;
}
