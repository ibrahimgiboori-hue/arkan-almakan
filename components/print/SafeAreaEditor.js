'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ARKAN_LETTERHEAD_PROFILE } from '@/lib/print-governance';
import {
  PAGE_SAFE_AREA_COLUMNS,
  PAGE_SAFE_AREA_EDGES,
  PAPER_MM,
  centralSafeArea,
  contentBoxMm,
  edgeLabelAr,
  normaliseSafeAreaInput,
  safeAreaWarnings,
} from '@/lib/page-geometry.mjs';

const PREVIEW_WIDTH_PX = 420;
const MM = PREVIEW_WIDTH_PX / PAPER_MM.portrait.widthMm; // px per mm in the preview
const ARTWORK = Object.freeze({
  topMm: ARKAN_LETTERHEAD_PROFILE.portraitTopArtworkMm,
  bottomMm: ARKAN_LETTERHEAD_PROFILE.portraitBottomArtworkMm,
});

// Default data source: the live app_settings row and the brand bucket.
// Passing another `source` (same shape) lets the editor run against fixed data, e.g. in a preview.
export const supabaseSafeAreaSource = Object.freeze({
  async load() {
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data || {};
  },
  async save(values) {
    const { data, error } = await supabase.from('app_settings').update(values).eq('id', 1).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('row-level security');
    return data;
  },
  assetUrl(path) {
    return path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : null;
  },
});
const toForm = (area) => Object.fromEntries(PAGE_SAFE_AREA_EDGES.map((edge) => [edge, String(area[edge])]));
const fromForm = (form) => Object.fromEntries(PAGE_SAFE_AREA_EDGES.map((edge) => [edge, Number(form[edge])]));

function EdgeInput({ edge, value, onChange, disabled }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 13 }}>
      <span>الهامش {edgeLabelAr(edge)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="90"
          step="0.5"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(edge, event.target.value)}
          aria-label={`الهامش ${edgeLabelAr(edge)} بالمليمتر`}
          style={{ width: 76, textAlign: 'center', direction: 'ltr', font: 'inherit', fontSize: 15, padding: '6px 4px' }}
        />
        <span style={{ fontSize: 12 }}>مم</span>
      </span>
    </label>
  );
}

function PagePreview({ area, settings, preprinted, assetUrl }) {
  const full = !preprinted && settings?.letterhead_image_path ? assetUrl(settings.letterhead_image_path) : null;
  const header = !preprinted && !full ? assetUrl(settings?.header_image_path) : null;
  const footer = !preprinted && !full ? assetUrl(settings?.footer_image_path) : null;
  const heightPx = PAPER_MM.portrait.heightMm * MM;
  const box = contentBoxMm(area);
  const sampleRows = Math.max(0, Math.floor((box.heightMm - 52) / 7));

  return (
    <div
      role="img"
      aria-label={`معاينة ورقة A4: المحتوى ${box.widthMm} × ${box.heightMm} مم`}
      style={{ position: 'relative', width: PREVIEW_WIDTH_PX, height: heightPx, background: '#fff', boxShadow: '0 2px 12px rgba(40,20,20,.18)', overflow: 'hidden', flex: '0 0 auto' }}
    >
      {full ? <img src={full} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /> : null}
      {header ? <img src={header} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: Number(settings?.header_height_mm || 40) * MM }} /> : null}
      {footer ? <img src={footer} alt="" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: Number(settings?.footer_height_mm || 32) * MM }} /> : null}
      {preprinted ? <>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ARTWORK.topMm * MM, background: 'repeating-linear-gradient(135deg,#f3eeee 0 6px,#fff 6px 12px)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ARTWORK.bottomMm * MM, background: 'repeating-linear-gradient(135deg,#f3eeee 0 6px,#fff 6px 12px)' }} />
      </> : null}

      <div
        data-safe-area-preview="true"
        style={{
          position: 'absolute',
          top: area.topMm * MM, bottom: area.bottomMm * MM, right: area.rightMm * MM, left: area.leftMm * MM,
          border: '1.5px dashed #1F4E79', background: 'rgba(231,238,246,.35)',
          display: 'flex', flexDirection: 'column', gap: 5 * MM / 2, padding: 2 * MM, boxSizing: 'border-box',
        }}
      >
        <div style={{ height: 6 * MM, width: '45%', background: '#8B3332', borderRadius: 2, alignSelf: 'flex-start' }} />
        <div style={{ height: 3 * MM, width: '80%', background: '#d8d1cc', borderRadius: 2 }} />
        <div style={{ height: 3 * MM, width: '65%', background: '#d8d1cc', borderRadius: 2 }} />
        <div style={{ height: 6 * MM, background: '#5E1F1F', borderRadius: 1, marginTop: 2 * MM }} />
        {Array.from({ length: sampleRows }, (_, index) => (
          <div key={index} style={{ height: 5 * MM, borderBottom: '1px solid #e2dcd8', background: index % 2 ? '#fff' : '#faf8f7' }} />
        ))}
      </div>

      <span style={{ position: 'absolute', top: Math.max(2, area.topMm * MM - 16), right: area.rightMm * MM + 4, fontSize: 11, color: '#1F4E79', background: 'rgba(255,255,255,.9)', padding: '0 4px' }}>{area.topMm} مم</span>
      <span style={{ position: 'absolute', bottom: Math.max(2, area.bottomMm * MM - 16), left: area.leftMm * MM + 4, fontSize: 11, color: '#1F4E79', background: 'rgba(255,255,255,.9)', padding: '0 4px' }}>{area.bottomMm} مم</span>
    </div>
  );
}

export default function SafeAreaEditor({ source = supabaseSafeAreaSource }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [preprinted, setPreprinted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    source.load()
      .then((data) => { if (!cancelled) { setSettings(data); setForm(toForm(centralSafeArea(data))); } })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError?.message || 'تعذّر تحميل إعدادات الصفحة.');
        setSettings({}); setForm(toForm(centralSafeArea({})));
      });
    return () => { cancelled = true; };
  }, [source]);

  const saved = useMemo(() => (settings ? centralSafeArea(settings) : null), [settings]);
  const draft = useMemo(() => (form ? centralSafeArea(Object.fromEntries(
    PAGE_SAFE_AREA_EDGES.map((edge) => [PAGE_SAFE_AREA_COLUMNS[edge], form[edge]]),
  )) : null), [form]);
  const validation = useMemo(() => (form ? normaliseSafeAreaInput(fromForm(form)) : null), [form]);
  const warnings = useMemo(() => (draft ? safeAreaWarnings(draft, { artwork: ARTWORK }) : []), [draft]);
  const dirty = Boolean(saved && draft && PAGE_SAFE_AREA_EDGES.some((edge) => saved[edge] !== draft[edge]));

  function change(edge, value) {
    setMessage('');
    setForm((current) => ({ ...current, [edge]: value }));
  }

  async function save() {
    setError(''); setMessage('');
    const result = normaliseSafeAreaInput(fromForm(form));
    if (!result.ok) { setError(result.errors.join(' ')); return; }
    setBusy(true);
    let data;
    try {
      data = await source.save(result.values);
    } catch (saveError) {
      setBusy(false);
      setError(String(saveError?.message || '').includes('row-level security')
        ? 'حفظ المساحات الآمنة للمدير التنفيذي فقط.'
        : `تعذّر الحفظ: ${saveError?.message || saveError}`);
      return;
    }
    setBusy(false);
    setSettings(data);
    setForm(toForm(centralSafeArea(data)));
    setMessage('تم الحفظ. كل المطبوعات تستخدم هذه المساحات من الآن، إلا مستندًا ثبّت هوامشه بنفسه.');
  }

  if (!settings || !form || !draft) return <div className="empty">جارٍ تحميل إعدادات الصفحة…</div>;

  const box = contentBoxMm(draft);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', padding: 16 }}>
      <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', gap: 10, alignItems: 'center', justifyItems: 'center' }}>
        <div style={{ gridColumn: 2, gridRow: 1 }}><EdgeInput edge="topMm" value={form.topMm} onChange={change} disabled={busy} /></div>
        <div style={{ gridColumn: 1, gridRow: 2 }}><EdgeInput edge="rightMm" value={form.rightMm} onChange={change} disabled={busy} /></div>
        <div style={{ gridColumn: 2, gridRow: 2 }}><PagePreview area={draft} settings={settings} preprinted={preprinted} assetUrl={source.assetUrl} /></div>
        <div style={{ gridColumn: 3, gridRow: 2 }}><EdgeInput edge="leftMm" value={form.leftMm} onChange={change} disabled={busy} /></div>
        <div style={{ gridColumn: 2, gridRow: 3 }}><EdgeInput edge="bottomMm" value={form.bottomMm} onChange={change} disabled={busy} /></div>
      </div>

      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 15 }}>مساحة المحتوى</strong>
          <span style={{ fontSize: 22, fontWeight: 700 }}><bdi>{box.widthMm} × {box.heightMm}</bdi> مم <span style={{ fontSize: 13, fontWeight: 400 }}>(عرض × ارتفاع)</span></span>
          <span className="hint">الخط المتقطع هو حدود المحتوى في كل صفحة. ما يزيد ينتقل لصفحة جديدة تلقائيًا، ولا ينقسم صف جدول بين صفحتين.</span>
        </div>

        <fieldset style={{ border: '1px solid var(--ui-border, #ddd)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ fontSize: 13, padding: '0 4px' }}>المعاينة على</legend>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="radio" name="safe-area-paper" checked={!preprinted} onChange={() => setPreprinted(false)} /> الترويسة الرقمية (PDF)</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="radio" name="safe-area-paper" checked={preprinted} onChange={() => setPreprinted(true)} /> ورق مطبوع مسبقًا (المنطقة المظللة = رسم الترويسة المقاس)</label>
        </fieldset>

        {warnings.length ? (
          <div role="alert" style={{ border: '1px solid #e5b8b5', background: '#fdf1f0', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, color: '#7a1f1c' }}>
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
            <span style={{ color: '#5c3a38' }}>تنبيه فقط: القرار لك ويُحفظ كما تحدده.</span>
          </div>
        ) : null}
        {validation && !validation.ok ? <div role="alert" style={{ color: '#7a1f1c', fontSize: 13.5 }}>{validation.errors.join(' ')}</div> : null}
        {error ? <div role="alert" style={{ color: '#7a1f1c', fontSize: 13.5 }}>{error}</div> : null}
        {message ? <div role="status" style={{ color: '#1f5a2e', fontSize: 13.5 }}>{message}</div> : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={save} disabled={busy || !dirty || !validation?.ok}>{busy ? 'جارٍ الحفظ…' : 'حفظ المساحات الآمنة'}</button>
          <button type="button" className="btn ghost" onClick={() => { setForm(toForm(saved)); setError(''); setMessage(''); }} disabled={busy || !dirty}>تراجع عن التعديل</button>
        </div>
        <span className="hint">المحفوظ حاليًا: أعلى {saved.topMm} · أسفل {saved.bottomMm} · يمين {saved.rightMm} · يسار {saved.leftMm} مم.</span>
      </div>
    </div>
  );
}
