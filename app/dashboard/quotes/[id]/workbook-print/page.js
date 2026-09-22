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
  const [familyRecord, setFamilyRecord] = useState(null);
  const [settings, setSettings] = useState(null);
  const [overlayPositions, setOverlayPositions] = useState({});
  const [veilOpacity, setVeilOpacity] = useState(0.82);
  const [sideMarginPreset, setSideMarginPreset] = useState('small');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [q, l, p, family, cfg] = await Promise.all([
      supabase.from('quotations').select('*').eq('id', id).maybeSingle(),
      supabase.from('quotation_lines').select('*').eq('quotation_id', id).order('sort_order'),
      supabase.from('quotation_payments').select('*').eq('quotation_id', id).order('sort_order'),
      supabase.from('print_family_workbooks').select('ui_schema,version,original_name,storage_path').eq('family_id','quotations').maybeSingle(),
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
    setFamilyRecord(family.data || null);
    setSettings(cfg.data || {});
    setOverlayPositions(q.data?.print_overlay_positions || {});
    setVeilOpacity(Number(cfg.data?.print_white_veil_opacity ?? 0.82));
    setSideMarginPreset(['small','medium','large'].includes(cfg.data?.print_side_margin_preset)
      ? cfg.data.print_side_margin_preset
      : 'small');
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
          unit_price:money(Number(line.unit_price || 0)),
          line_total:money(lineTotal(line, quote?.show_qty)),
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

  const stationeryImages = useMemo(() => {
    if (!settings?.letterhead_image_path) return {};
    return {
      letterhead:supabase.storage.from('brand').getPublicUrl(settings.letterhead_image_path).data.publicUrl,
    };
  }, [settings]);

  async function saveSideMarginPreset(value) {
    const next = ['small','medium','large'].includes(value) ? value : 'small';
    setSideMarginPreset(next);
    const { error:saveError } = await supabase.from('app_settings')
      .update({ print_side_margin_preset:next })
      .eq('id', 1);
    if (saveError) setError('تعذّر حفظ الهامش الجانبي: ' + saveError.message);
    else {
      setSaved('تم حفظ الهامش الجانبي');
      window.setTimeout(()=>setSaved(''),1200);
    }
  }

  async function saveVeilOpacity(value) {
    const next = Math.min(1, Math.max(0, Number(value ?? 0.82)));
    const { error:saveError } = await supabase.from('app_settings')
      .update({ print_white_veil_opacity:next })
      .eq('id', 1);
    if (saveError) setError('تعذّر حفظ عتامة الطبقة البيضاء: ' + saveError.message);
    else {
      setSaved('تم حفظ عتامة الطبقة البيضاء');
      window.setTimeout(()=>setSaved(''),1200);
    }
  }

  async function moveOverlay(overlayId, position, persist) {
    let next = null;
    setOverlayPositions((current) => {
      next = { ...(current || {}), [overlayId]:position };
      return next;
    });
    if (!persist) return;
    next = next || { ...(overlayPositions || {}), [overlayId]:position };
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


  async function downloadFilledWorkbook() {
    if (!familyRecord?.storage_path || !model) return;
    setSaved('جارٍ تجهيز Excel من القالب المرفوع…');
    const download = await supabase.storage.from('print-families').download(familyRecord.storage_path);
    if (download.error) {
      setError('تعذّر تحميل ملف العائلة الأصلي: ' + download.error.message);
      setSaved('');
      return;
    }

    const form = new FormData();
    form.append('workbook', new File([download.data], familyRecord.original_name || 'quotation-family.xlsx', {
      type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    form.append('payload', JSON.stringify({
      model,
      variables:schema?.variables || [],
      visibility:schema?.visibility || [],
      toggles,
      repeatGroups,
      values,
      fileName:(quote?.quote_no || 'quotation') + '-' + model.name + '.xlsx',
    }));

    const response = await fetch('/api/print-families/fill-xlsx', { method:'POST', body:form });
    if (!response.ok) {
      setError('تعذّر إنشاء نسخة Excel المعبأة من القالب.');
      setSaved('');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (quote?.quote_no || 'quotation') + '-' + model.name + '.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setSaved('تم إنشاء Excel من نفس القالب دون إعادة تصميم');
    window.setTimeout(()=>setSaved(''),1600);
  }

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
        <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'#555'}}>
          <span>الهامش الجانبي</span>
          <select
            value={sideMarginPreset}
            onChange={(event)=>saveSideMarginPreset(event.target.value)}
            style={{fontSize:12,padding:'5px 7px'}}
          >
            <option value="small">صغير</option>
            <option value="medium">متوسط</option>
            <option value="large">كبير</option>
          </select>
        </label>
        <label style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'#555'}}>
          <span>عتامة الطبقة البيضاء {Math.round(veilOpacity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={veilOpacity}
            onChange={(event)=>setVeilOpacity(Number(event.target.value))}
            onMouseUp={(event)=>saveVeilOpacity(event.currentTarget.value)}
            onTouchEnd={(event)=>saveVeilOpacity(event.currentTarget.value)}
            style={{width:110}}
          />
        </label>
        <button onClick={load} style={{padding:'7px 12px'}}>تحديث البيانات</button>
        <button onClick={downloadFilledWorkbook} style={{padding:'7px 12px'}}>تنزيل Excel المعبأ</button>
        <button onClick={()=>window.print()} style={{padding:'7px 12px',fontWeight:700}}>طباعة / حفظ PDF</button>
      </div>
    </div>

    <main style={{
      width:'210mm',minHeight:'297mm',margin:'18px auto',background:'#fff',
      boxShadow:'0 6px 28px rgba(0,0,0,.18)',overflow:'visible',boxSizing:'border-box',
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
        stationeryImages={stationeryImages}
        whiteVeilOpacity={veilOpacity}
        headerHeightMm={Number(settings?.stationery_analysis?.headerHeightMm || 0)}
        footerHeightMm={Number(settings?.stationery_analysis?.footerHeightMm || 0)}
        sideMarginPreset={sideMarginPreset}
        editableOverlays
        onOverlayMove={moveOverlay}
        printMode
      />
    </main>

    <style jsx global>{`
      @page { size:A4 portrait; margin:0; }
      @media print {
        html, body { background:#fff !important; margin:0 !important; padding:0 !important; width:210mm !important; }
        body * { visibility:hidden; }
        main, main * { visibility:visible; }
        main {
          position:absolute !important;
          left:0 !important;
          top:0 !important;
          width:210mm !important;
          min-height:297mm !important;
          height:auto !important;
          margin:0 !important;
          padding:0 !important;
          box-sizing:border-box !important;
          box-shadow:none !important;
          overflow:visible !important;
        }
        .workbook-page {
          margin:0 !important;
          box-shadow:none !important;
          break-inside:avoid !important;
          page-break-inside:avoid !important;
          break-after:page !important;
          page-break-after:always !important;
        }
        .workbook-page:last-child {
          break-after:auto !important;
          page-break-after:auto !important;
        }
        .no-print { display:none !important; }
      }
    `}</style>
  </div>;
}
