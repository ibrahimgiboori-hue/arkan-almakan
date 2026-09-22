'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { SYSTEM } from '@/lib/system-constitution';
import { numberLines, lineTotal, totals } from '@/lib/quote-calc';
import WorkbookModelPreview from '@/components/quotes/WorkbookModelPreview';

function pickModel(schema, quote) {
  const models = Array.isArray(schema?.models) ? schema.models : [];
  if (!models.length) return null;
  if (quote?.print_model_sheet) {
    const exact = models.find((model) => model.name === quote.print_model_sheet);
    if (exact) return exact;
  }
  const wantsQty = Boolean(quote?.show_qty);
  const wantsVat = quote?.vat_mode !== 'none';
  return models.find((model) => Boolean(model.hasQty) === wantsQty && Boolean(model.hasVat) === wantsVat) || models[0];
}

function dateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    day:'2-digit', month:'2-digit', year:'numeric',
  }).format(date);
}

export default function WorkbookQuotePrintPage() {
  const { id } = useParams();
  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [payments, setPayments] = useState([]);
  const [schema, setSchema] = useState(null);
  const [settings, setSettings] = useState(null);
  const [overlayPositions, setOverlayPositions] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [q, l, p, family, cfg] = await Promise.all([
      supabase.from('quotations').select('*').eq('id', id).maybeSingle(),
      supabase.from('quotation_lines').select('*').eq('quotation_id', id).order('sort_order'),
      supabase.from('quotation_payments').select('*').eq('quotation_id', id).order('sort_order'),
      supabase.from('print_family_workbooks').select('ui_schema,version,original_name').eq('family_id','quotations').maybeSingle(),
      supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
    ]);

    const firstError = q.error || l.error || p.error || family.error || cfg.error;
    if (firstError) {
      setError(firstError.message || 'تعذّر تحميل معاينة Excel.');
      return;
    }
    if (!q.data) {
      setError('لم يُعثر على عرض السعر.');
      return;
    }

    setQuote(q.data);
    setLines(l.data || []);
    setPayments(p.data || []);
    setSchema(family.data?.ui_schema || null);
    setSettings(cfg.data || {});
    setOverlayPositions(q.data?.print_overlay_positions || {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const model = useMemo(() => pickModel(schema, quote), [schema, quote]);

  const toggles = useMemo(() => {
    const rules = Array.isArray(schema?.visibility) ? schema.visibility : [];
    return Object.fromEntries(rules.map((rule) => [
      rule.toggle,
      quote?.[rule.toggle] ?? rule.defaultValue,
    ]));
  }, [schema, quote]);

  const repeatGroups = useMemo(() => {
    const numbered = numberLines(lines);
    return {
      line_items:numbered
        .filter((line) => line.kind !== 'title')
        .map((line) => ({
          item_no:line.number,
          description_ar:line.description_ar || '',
          description_en:line.description_en || '',
          unit:line.unit || '',
          qty:line.qty ?? '',
          unit_price:line.unit_price ?? '',
          line_total:lineTotal(line, quote?.show_qty),
        })),
      payment_terms:payments.map((payment, index) => ({
        payment_terms:`${payment.label || `الدفعة ${index + 1}`}: ${Number(payment.percent || 0)}%${payment.trigger_note ? ` — ${payment.trigger_note}` : ''}`,
      })),
      terms:String(quote?.terms_text || '')
        .split(/\r?\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ terms:text })),
    };
  }, [lines, payments, quote]);

  const overlayImages = useMemo(() => {
    if (!settings) return {};
    const stamp = settings.stamp_image_path
      ? supabase.storage.from('brand').getPublicUrl(settings.stamp_image_path).data.publicUrl
      : '';
    const signature = settings.signature_image_path
      ? supabase.storage.from('brand').getPublicUrl(settings.signature_image_path).data.publicUrl
      : '';
    return { stamp, signature };
  }, [settings]);

  async function moveOverlay(id, position, persist) {
    setOverlayPositions((current) => ({ ...current, [id]:position }));
    if (!persist) return;
    const next = { ...(overlayPositions || {}), [id]:position };
    const { error:saveError } = await supabase.from('quotations')
      .update({ print_overlay_positions:next })
      .eq('id', id);
    if (saveError) setError('تعذّر حفظ موضع الختم/التوقيع: ' + saveError.message);
    else {
      setSaved('تم حفظ موضع الطبقة');
      window.setTimeout(()=>setSaved(''),1200);
    }
  }

  const values = useMemo(() => {
    if (!quote) return {};
    const numbered = numberLines(lines);
    const computed = totals(quote, lines);
    const first = numbered.find((line) => line.kind === 'item') || numbered[0] || null;
    const paymentText = payments
      .map((payment, index) => {
        const pct = Number(payment.percent || 0);
        const label = payment.label || `الدفعة ${index + 1}`;
        const trigger = payment.trigger_note ? ` — ${payment.trigger_note}` : '';
        return `${label}: ${pct}%${trigger}`;
      })
      .join('\n');

    return {
      document_title:quote.title_override || 'عرض سعر',
      quote_no:quote.quote_no || '',
      quote_date:dateText(quote.quote_date),
      client_name:quote.client_name || '',
      client_contact:quote.client_contact || '',
      project_ref:quote.project_ref || '',
      site_location:quote.site_location || '',
      valid_days:quote.valid_days ?? '',
      intro_text:quote.intro_text || '',
      closing_text:quote.closing_text || '',
      subtotal:money(computed.subtotal),
      vat_rate:`${Number(quote.vat_rate ?? SYSTEM.vatRate) * 100}%`,
      vat_amount:money(computed.vat),
      grand_total:money(computed.grand),
      plain_total:money(computed.grand),
      item_no:first?.number || 1,
      description_ar:first?.description_ar || '',
      description_en:first?.description_en || '',
      unit:first?.unit || '',
      qty:first?.qty ?? '',
      unit_price:first ? money(first.unit_price) : '',
      line_total:first ? money(lineTotal(first, quote.show_qty)) : '',
      payment_terms:paymentText,
      terms:quote.terms_text || '',
      representative_name:quote.arkan_signatory_name || '',
      representative_title:quote.arkan_signatory_title || '',
      stamp:'',
      signature:'',
      bank_name:settings?.bank_name_full || 'مصرف الراجحي',
      bank_account_no:settings?.bank_account_no || '',
      bank_iban:settings?.bank_iban || '',
    };
  }, [quote, lines, payments, settings]);

  if (error) return <div style={{padding:32,color:'#b42318'}}>{error}</div>;
  if (!quote || !schema) return <div style={{padding:32}}>جارٍ تجهيز تصميم Excel…</div>;
  if (!model) return <div style={{padding:32}}>لا يوجد نموذج Excel معتمد لهذا العرض.</div>;

  return <div style={{minHeight:'100vh',background:'#ececec'}}>
    <div className="no-print" style={{
      position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',
      justifyContent:'space-between',gap:12,padding:'10px 16px',
      background:'#fff',borderBottom:'1px solid #ddd',
    }}>
      <div>
        <strong>{model.name}</strong>
        <span style={{marginInlineStart:10,fontSize:12,color:'#666'}}>المصدر: ملف Excel المعتمد</span>
      </div>
      <div style={{display:'flex',gap:8}}>
        {saved ? <span style={{fontSize:12,color:'#147a37'}}>{saved}</span> : null}
        <button onClick={load} style={{padding:'7px 12px'}}>تحديث البيانات</button>
        <button onClick={()=>window.print()} style={{padding:'7px 12px',fontWeight:700}}>طباعة / حفظ PDF</button>
      </div>
    </div>

    <main style={{
      width:'210mm',minHeight:'297mm',margin:'18px auto',background:'#fff',
      boxShadow:'0 6px 28px rgba(0,0,0,.18)',overflow:'hidden',
    }}>
      <WorkbookModelPreview
        model={model}
        values={values}
        variables={schema?.variables || []}
        visibility={schema?.visibility || []}
        toggles={toggles}
        repeatGroups={repeatGroups}
        overlays={schema?.overlays || []}
        overlayImages={overlayImages}
        overlayPositions={overlayPositions}
        editableOverlays
        onOverlayMove={moveOverlay}
        printMode
      />
    </main>

    <style jsx global>{`
      @media print {
        html, body { background:#fff !important; }
        body * { visibility:hidden; }
        main, main * { visibility:visible; }
        main {
          position:absolute !important;
          left:0 !important;
          top:0 !important;
          width:210mm !important;
          min-height:297mm !important;
          margin:0 !important;
          box-shadow:none !important;
          overflow:visible !important;
        }
        .no-print { display:none !important; }
      }
    `}</style>
  </div>;
}
