'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import WorkbookModelPreview from '@/components/quotes/WorkbookModelPreview';
import { getPrintFamilyGovernance } from '@/lib/print-family-route-governance';

const FAMILY_ID = 'treasury_vouchers';
const FAMILY_ROUTE = getPrintFamilyGovernance(FAMILY_ID);
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
  const type = voucher?.voucher_type;
  const wanted = type === 'receipt' ? 'قبض' : 'صرف';
  return models.find((model) => String(model.name || '').includes(wanted)) || models[0];
}

function brandPublicUrl(path) {
  if (!path) return '';
  return supabase.storage.from('brand').getPublicUrl(path).data.publicUrl;
}

export default function TreasuryVoucherPrintPage() {
  const { id } = useParams();
  const search = useSearchParams();
  const embed = search.get('embed') === '1';
  const [voucher, setVoucher] = useState(null);
  const [settings, setSettings] = useState(null);
  const [schema, setSchema] = useState(null);
  const [familyRecord, setFamilyRecord] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      const [voucherQ, settingsQ, familyQ] = await Promise.all([
        supabase.rpc('fn_cash_voucher_print_get', { p_voucher_id:id }),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('print_family_workbooks').select('ui_schema,version,original_name,storage_path').eq('family_id', FAMILY_ID).maybeSingle(),
      ]);
      if (cancelled) return;
      const firstError = voucherQ.error || settingsQ.error || familyQ.error;
      if (firstError) {
        setError(firstError.message || 'تعذّر تحميل السند.');
        return;
      }
      if (!voucherQ.data) {
        setError('لم يُعثر على السند، أو لا تملك صلاحية عرضه.');
        return;
      }
      setVoucher(voucherQ.data);
      setSettings(settingsQ.data || {});
      setSchema(familyQ.data?.ui_schema || null);
      setFamilyRecord(familyQ.data || null);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const model = useMemo(() => pickVoucherModel(schema, voucher), [schema, voucher]);

  const toggles = useMemo(() => {
    const rules = Array.isArray(schema?.visibility) ? schema.visibility : [];
    return Object.fromEntries(rules.map((rule) => [
      rule.toggle,
      voucher?.[rule.toggle] ?? settings?.[rule.toggle] ?? rule.defaultValue,
    ]));
  }, [schema, voucher, settings]);

  const assetImages = useMemo(() => {
    if (!settings) return {};
    const companyLogo = brandPublicUrl(settings.company_logo_path) || '/brand/arkan-logo-official.svg';
    const stamp = brandPublicUrl(settings.stamp_image_path);
    const signature = brandPublicUrl(settings.signature_image_path);
    return {
      company_logo:companyLogo,
      company_logo_path:companyLogo,
      stamp,
      signature,
    };
  }, [settings]);

  const values = useMemo(() => {
    if (!voucher) return {};
    const totalHalalas = Math.round(Number(voucher.amount || 0) * 100);
    const amountRiyals = Math.floor(totalHalalas / 100);
    const amountHalalas = String(totalHalalas % 100).padStart(2, '0');
    const isReceipt = voucher.voucher_type === 'receipt';
    const method = METHOD_LABEL[voucher.payment_method] || voucher.payment_method || '';
    const idLabel = ID_NUMBER_LABEL[voucher.party_id_kind] || 'رقم إثبات';
    const effectivePaymentDate = voucher.payment_date || voucher.voucher_date || '';
    const companyNameAr = settings?.company_name_ar || 'أركان المكان للمقاولات';
    const companyNameEn = settings?.company_name_en || 'Arkan Al Makan Contracting';
    const legalAcknowledgement = 'وأقر أنا المستفيد الموقع أدناه باستلام كامل المبلغ المبين في هذا السند رقمًا وكتابةً عن الاستحقاق الموضح أعلاه، بعد الاطلاع على بياناته والعلم بسبب الصرف وطريقة الوفاء، ويعد توقيعي إقرارًا بصحة الاستلام في حدود هذا السند، دون أن يعد إبراءً عامًا عن أي حقوق أو التزامات أخرى.';

    return {
      document_title:isReceipt ? 'سند قبض' : 'سند صرف',
      voucher_type:latinDigits(voucher.voucher_type || ''),
      voucher_type_ar:isReceipt ? 'سند قبض' : 'سند صرف',
      voucher_type_en:isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER',
      voucher_no:latinDigits(voucher.voucher_no || ''),
      voucher_page_no:pageNo(voucher.page_no),
      page_no:pageNo(voucher.page_no),
      book_no:latinDigits(voucher.book_no || ''),
      voucher_date:dateText(voucher.voucher_date),
      voucher_date_gregorian:dateText(voucher.voucher_date),
      voucher_date_hijri:latinDigits(voucher.voucher_date_hijri || ''),
      payment_date:dateText(effectivePaymentDate),
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
      amount_number:`${amountRiyals.toLocaleString('en-US')}.${amountHalalas}`,
      amount_riyal:amountRiyals.toLocaleString('en-US'),
      amount_riyals:amountRiyals.toLocaleString('en-US'),
      amount_halalah:amountHalalas,
      amount_words:String(voucher.amount_words || '').replace(/\s+فقط\s+لا\s+غير\s*$/, '').trim(),
      amount_words_full:voucher.amount_words || '',
      legal_acknowledgement:legalAcknowledgement,
      beneficiary_role:isReceipt ? 'عميل' : 'موظف',
      company_name_ar:companyNameAr,
      company_name_en:companyNameEn,
      cr_number:latinDigits(settings?.cr_number || ''),
      vat_number:latinDigits(settings?.vat_number || ''),
      city:settings?.city || 'الرياض',
      accountant_name:voucher.accountant_name_snapshot || '',
      accountant_title:voucher.accountant_title_snapshot || '',
      approved_by_name:voucher.approved_by_name_snapshot || '',
      approved_by_title:voucher.approved_by_title_snapshot || '',
      company_logo:'',
      stamp:'',
      signature:'',
    };
  }, [voucher, settings]);

  const pageWidthMm = Number(model?.pageConfig?.widthMm || 210);
  const pageHeightMm = Number(model?.pageConfig?.heightMm || 297);
  const pageOrientation = pageWidthMm > pageHeightMm ? 'landscape' : 'portrait';

  if (error) return <div style={{ padding:40, direction:'rtl', color:'#b42318' }}>{error}</div>;
  if (!voucher || !settings) return <div style={{ padding:40, direction:'rtl' }}>جارٍ تجهيز السند…</div>;
  if (!schema || !model) return <div style={{ padding:40, direction:'rtl' }}>
    <h2>عائلة السندات المالية غير مفعّلة بعد</h2>
    <p>هذا المسار هو المسار الحاكم للسندات: {FAMILY_ROUTE?.canonicalPrintPath}</p>
    <p>ارفع ملف عائلة السندات المالية من إعدادات عوائل الطباعة حتى يعمل السند من Excel بدل القبطان.</p>
  </div>;

  return <div
    data-print-family={FAMILY_ID}
    data-print-family-route={FAMILY_ROUTE?.canonicalPrintPath || ''}
    data-captain="off"
    style={{ minHeight:'100vh', background:embed ? '#fff' : '#ececec', direction:'rtl' }}
  >
    {!embed ? <div className="no-print" style={{
      position:'sticky', top:0, zIndex:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      padding:'10px 16px', background:'#fff', borderBottom:'1px solid #ddd',
    }}>
      <div>
        <strong>{model.name}</strong>
        <span style={{ marginInlineStart:10, fontSize:12, color:'#666' }}>
          عائلة {FAMILY_ROUTE?.label || FAMILY_ID} — المسار الحاكم بلا قبطان
        </span>
      </div>
      <button type="button" onClick={() => window.print()} style={{ padding:'7px 12px', fontWeight:700 }}>طباعة / حفظ PDF</button>
    </div> : null}

    <main style={{
      width:`${pageWidthMm}mm`, minHeight:`${pageHeightMm}mm`, margin:embed ? '0 auto' : '18px auto', background:'#fff',
      boxShadow:embed ? 'none' : '0 6px 28px rgba(0,0,0,.18)', overflow:'visible', boxSizing:'border-box',
    }}>
      <WorkbookModelPreview
        model={model}
        values={values}
        variables={schema?.variables || []}
        visibility={schema?.visibility || []}
        toggles={toggles}
        repeatGroups={{}}
        overlays={schema?.overlays || []}
        overlayImages={assetImages}
        assetImages={assetImages}
        stationeryImages={{}}
        whiteVeilOpacity={Number(settings?.print_white_veil_opacity ?? 0.82)}
        sideMarginPreset={settings?.print_side_margin_preset || 'small'}
        printMode
      />
    </main>

    <style jsx global>{`
      @page { size:A4 ${pageOrientation}; margin:0; }
      @media print {
        html, body { background:#fff !important; margin:0 !important; padding:0 !important; width:${pageWidthMm}mm !important; }
        body * { visibility:hidden; }
        main, main * { visibility:visible; }
        main {
          position:absolute !important;
          left:0 !important;
          top:0 !important;
          width:${pageWidthMm}mm !important;
          min-height:${pageHeightMm}mm !important;
          height:auto !important;
          margin:0 !important;
          padding:0 !important;
          box-sizing:border-box !important;
          box-shadow:none !important;
          overflow:visible !important;
        }
        .workbook-preview-page {
          margin:0 !important;
          box-shadow:none !important;
          break-inside:avoid !important;
          page-break-inside:avoid !important;
        }
        .no-print { display:none !important; }
      }
    `}</style>
  </div>;
}
