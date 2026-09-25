'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import WorkbookFamilyGridPreview from '@/components/quotes/WorkbookFamilyGridPreview';

const FAMILY_ID = 'treasury_vouchers';
const METHOD_LABEL = { cash:'نقدًا', bank_transfer:'تحويل بنكي', cheque:'شيك', card:'بطاقة', other:'أخرى' };
const ID_NUMBER_LABEL = { national_id:'هوية رقم', iqama:'إقامة رقم', cr:'سجل تجاري رقم', passport:'جواز رقم', other:'رقم إثبات' };

function latinDigits(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function dateText(value) {
  const raw = latinDigits(value || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

function pageNo(value) {
  return String(Number(value || 0)).padStart(2, '0');
}

function pickVoucherModel(schema, voucher) {
  const models = Array.isArray(schema?.models) ? schema.models : [];
  if (!models.length) return null;
  const wanted = voucher?.voucher_type === 'receipt' ? 'قبض' : 'صرف';
  return models.find((model) => String(model.name || '').includes(wanted)) || models[0];
}

function publicBrandUrl(path) {
  return path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : '';
}

function buildVoucherValues(voucher, settings) {
  const totalHalalas = Math.round(Number(voucher.amount || 0) * 100);
  const amountRiyals = Math.floor(totalHalalas / 100);
  const amountHalalas = String(totalHalalas % 100).padStart(2, '0');
  const isReceipt = voucher.voucher_type === 'receipt';
  const method = METHOD_LABEL[voucher.payment_method] || voucher.payment_method || '';
  const idLabel = ID_NUMBER_LABEL[voucher.party_id_kind] || 'رقم إثبات';
  const paymentDate = voucher.payment_date || voucher.voucher_date || '';

  return {
    document_title:isReceipt ? 'سند قبض' : 'سند صرف',
    voucher_title:isReceipt ? 'سند قبض' : 'سند صرف',
    voucher_title_en:isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER',
    voucher_type_ar:isReceipt ? 'سند قبض' : 'سند صرف',
    voucher_type_en:isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER',
    voucher_no:latinDigits(voucher.voucher_no || ''),
    voucher_page_no:pageNo(voucher.page_no),
    page_no:pageNo(voucher.page_no),
    book_no:latinDigits(voucher.book_no || ''),
    voucher_date:dateText(voucher.voucher_date),
    voucher_date_gregorian:dateText(voucher.voucher_date),
    voucher_date_hijri:latinDigits(voucher.voucher_date_hijri || ''),
    payment_date:dateText(paymentDate),
    party_name:voucher.party_name || '',
    beneficiary_name:voucher.party_name || '',
    party_id_label:idLabel,
    party_id_number:latinDigits(voucher.party_id_number || ''),
    party_nationality:voucher.party_nationality || '',
    party_mobile:latinDigits(voucher.party_mobile || ''),
    party_address:voucher.party_address || '',
    payment_method:method,
    payment_reference:latinDigits(voucher.payment_reference || ''),
    bank_name:voucher.bank_name || '',
    description:voucher.description || '',
    receipt_reason:voucher.description || '',
    supporting_document:voucher.supporting_reference || '',
    amount_number:`${amountRiyals.toLocaleString('en-US')}.${amountHalalas}`,
    amount_riyal:amountRiyals.toLocaleString('en-US'),
    amount_riyals:amountRiyals.toLocaleString('en-US'),
    amount_halalah:amountHalalas,
    amount_words:String(voucher.amount_words || '').replace(/\s+فقط\s+لا\s+غير\s*$/, '').trim(),
    amount_words_full:voucher.amount_words || '',
    legal_ack:voucher.legal_text_snapshot || '',
    beneficiary_role:isReceipt ? 'عميل' : 'موظف',
    party_title:voucher.party_title || '',
    company_name_ar:settings?.company_name_ar || 'أركان المكان للمقاولات',
    company_name_en:settings?.company_name_en || 'Arkan Al Makan Contracting',
    cr_number:latinDigits(settings?.cr_number || ''),
    vat_number:latinDigits(settings?.vat_number || ''),
    city:settings?.city || 'الرياض',
    accountant_name:voucher.accountant_name_snapshot || '',
    accountant_title:voucher.accountant_title_snapshot || '',
    approved_by_name:voucher.approved_by_name_snapshot || '',
    approved_by_title:voucher.approved_by_title_snapshot || '',
    approver_name:voucher.approved_by_name_snapshot || '',
    approver_title:voucher.approved_by_title_snapshot || '',
    issuer_name:voucher.issuer_name_snapshot || '',
    issuer_title:voucher.issuer_title_snapshot || '',
    company_logo:'',
  };
}

export default function TreasuryVoucherPrintPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, voucher:null, settings:null, schema:null, error:'' });
  const [embed, setEmbed] = useState(false);

  useEffect(() => {
    setEmbed(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1');
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState((current) => ({ ...current, loading:true, error:'' }));
      const [voucherQ, settingsQ, familyQ] = await Promise.all([
        supabase.rpc('fn_cash_voucher_print_get', { p_voucher_id:id }),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('print_family_workbooks').select('ui_schema').eq('family_id', FAMILY_ID).maybeSingle(),
      ]);
      if (cancelled) return;
      const firstError = voucherQ.error || settingsQ.error || familyQ.error;
      if (firstError) {
        setState({ loading:false, voucher:null, settings:null, schema:null, error:firstError.message || 'تعذّر تحميل السند.' });
        return;
      }
      if (!voucherQ.data) {
        setState({ loading:false, voucher:null, settings:null, schema:null, error:'لم يُعثر على السند، أو لا تملك صلاحية عرضه.' });
        return;
      }
      setState({
        loading:false,
        voucher:voucherQ.data,
        settings:settingsQ.data || {},
        schema:familyQ.data?.ui_schema || null,
        error:'',
      });
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const model = useMemo(() => pickVoucherModel(state.schema, state.voucher), [state.schema, state.voucher]);
  const values = useMemo(() => state.voucher ? buildVoucherValues(state.voucher, state.settings || {}) : {}, [state.voucher, state.settings]);
  const toggles = useMemo(() => {
    const rules = Array.isArray(state.schema?.visibility) ? state.schema.visibility : [];
    return Object.fromEntries(rules.map((rule) => [rule.toggle, state.voucher?.[rule.toggle] ?? state.settings?.[rule.toggle] ?? rule.defaultValue]));
  }, [state.schema, state.voucher, state.settings]);
  const logoUrl = useMemo(() => publicBrandUrl(state.settings?.company_logo_path) || '/brand/arkan-logo-white.svg', [state.settings]);

  if (state.error) return <div style={{ padding:40, direction:'rtl', color:'#b42318' }}>{state.error}</div>;
  if (state.loading) return <div style={{ padding:40, direction:'rtl' }}>جارٍ تجهيز السند من عائلة Excel…</div>;
  if (!state.schema || !model) return <div style={{ padding:40, direction:'rtl' }}>
    <h2>عائلة السندات المالية غير مفعّلة</h2>
    <p>هذا المسار خرج من القبطان، ولن يرسم سندًا قديمًا. ارفع عائلة treasury_vouchers من إعدادات عوائل المطبوعات.</p>
  </div>;

  const pageWidthMm = Number(model?.pageConfig?.widthMm || 297);
  const pageHeightMm = Number(model?.pageConfig?.heightMm || 210);

  return <div data-print-family={FAMILY_ID} data-captain="off" style={{ minHeight:'100vh', background:embed ? '#fff' : '#ececec', direction:'rtl' }}>
    {!embed ? <div className="no-print" style={{
      position:'sticky', top:0, zIndex:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      padding:'10px 16px', background:'#fff', borderBottom:'1px solid #ddd',
    }}>
      <div>
        <strong>{model.name}</strong>
        <span style={{ marginInlineStart:10, fontSize:12, color:'#666' }}>السندات المالية تعمل الآن من عائلة Excel — القبطان مفصول</span>
      </div>
      <button type="button" onClick={() => window.print()} style={{ padding:'7px 12px', fontWeight:700 }}>طباعة / حفظ PDF</button>
    </div> : null}

    <main style={{
      width:`${pageWidthMm}mm`, minHeight:`${pageHeightMm}mm`, margin:embed ? '0 auto' : '18px auto',
      background:'#fff', boxShadow:embed ? 'none' : '0 6px 28px rgba(0,0,0,.18)', overflow:'visible', boxSizing:'border-box',
    }}>
      <WorkbookFamilyGridPreview
        model={model}
        values={values}
        toggles={toggles}
        overlayImages={{ company_logo:logoUrl, company_logo_path:logoUrl }}
        whiteVeilOpacity={Number(state.settings?.print_white_veil_opacity ?? 0.82)}
        printMode
      />
    </main>
  </div>;
}
