'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

const MIN_DENSITY = 84;
const MAX_DENSITY = 104;

export default function PrintFrame({
  cfg,
  children,
  showLetterhead = true,
  showStamp = false,
  stampSizeMm,
}) {
  const top = Number(cfg?.letterhead_top_mm ?? 47);
  const bottom = Number(cfg?.letterhead_bottom_mm ?? 39);
  const side = Number(cfg?.letterhead_side_mm ?? 19);

  const full = showLetterhead ? assetUrl(cfg?.letterhead_image_path) : null;
  const header = !full && showLetterhead ? assetUrl(cfg?.header_image_path) : null;
  const footer = !full && showLetterhead ? assetUrl(cfg?.footer_image_path) : null;
  const watermark = !full && showLetterhead ? assetUrl(cfg?.watermark_image_path) : null;
  const stamp = showStamp ? assetUrl(cfg?.stamp_image_path) : null;

  const mainRef = useRef(null);
  const innerRef = useRef(null);
  const [density, setDensity] = useState(100);
  const [autoFit, setAutoFit] = useState(true);
  const [fitsOnePage, setFitsOnePage] = useState(true);

  const evaluateFit = () => {
    const main = mainRef.current;
    const inner = innerRef.current;
    if (!main || !inner) return;

    const style = window.getComputedStyle(main);
    const available = main.clientHeight
      - (parseFloat(style.paddingTop) || 0)
      - (parseFloat(style.paddingBottom) || 0);
    const used = inner.scrollHeight;
    const fits = used <= available + 2;
    setFitsOnePage(fits);

    if (autoFit && !fits && density > MIN_DENSITY) {
      setDensity((v) => Math.max(MIN_DENSITY, v - 2));
    }
  };

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(evaluateFit);
    return () => window.cancelAnimationFrame(id);
  }, [density, autoFit, top, bottom, side]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const resize = new ResizeObserver(() => {
      window.requestAnimationFrame(evaluateFit);
    });
    resize.observe(inner);

    const mutation = new MutationObserver(() => {
      if (autoFit) setDensity(100);
      window.requestAnimationFrame(evaluateFit);
    });
    mutation.observe(inner, { subtree:true, childList:true, characterData:true });

    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [autoFit]);

  function enableAutoFit() {
    setAutoFit(true);
    setDensity(100);
  }

  function manualDensity(value) {
    setAutoFit(false);
    setDensity(Number(value));
  }

  return (
    <>
      <div className="print-fitbar no-print" role="region" aria-label="ضبط ملاءمة صفحة الطباعة">
        <div className="print-fitbar-main">
          <button type="button" className={autoFit ? 'active' : ''} onClick={enableAutoFit}>ملاءمة تلقائية لصفحة واحدة</button>
          <label htmlFor="print-density">حجم وتباعد المحتوى: <strong>{density}%</strong></label>
          <input
            id="print-density"
            type="range"
            min={MIN_DENSITY}
            max={MAX_DENSITY}
            step="1"
            value={density}
            onChange={(e)=>manualDensity(e.target.value)}
          />
          <button type="button" onClick={()=>manualDensity(100)}>100%</button>
        </div>
        <div className={`print-fit-status ${fitsOnePage ? 'ok' : 'warn'}`}>
          {fitsOnePage
            ? 'المحتوى يتسع في صفحة واحدة'
            : density <= MIN_DENSITY
              ? 'المحتوى ما زال أطول من صفحة واحدة عند الحد الآمن للتصغير'
              : 'جارٍ لملمة المحتوى داخل صفحة واحدة'}
        </div>
      </div>

      <div className="print-page-wrap">
        <div className="print-page" style={{'--print-fit': density / 100}}>
          <div className="print-assets" aria-hidden="true">
            {full && <img src={full} className="print-master-full" alt="" />}
            {header && <img src={header} className="print-master-header" alt="" style={{height:`${Number(cfg?.header_height_mm || 40)}mm`}} />}
            {footer && <img src={footer} className="print-master-footer" alt="" style={{height:`${Number(cfg?.footer_height_mm || 32)}mm`}} />}
            {watermark && <img src={watermark} className="print-master-watermark" alt="" />}
          </div>
          <main ref={mainRef} className="print-content" style={{padding:`${top}mm ${side}mm ${bottom}mm`}}>
            <div ref={innerRef} className="print-fit-content">
              {children}
            </div>
          </main>
          {stamp && <img src={stamp} className="print-master-stamp" alt="" style={{width:`${Number(stampSizeMm ?? cfg?.stamp_size_mm ?? 30)}mm`}} />}
        </div>
      </div>

      <style jsx global>{`
        .print-fitbar{position:sticky;top:58px;z-index:19;max-width:210mm;margin:10px auto 0;padding:9px 12px;background:#fff;border:1px solid #bdbdbd;color:#222;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        .print-fitbar-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .print-fitbar button{font:inherit;font-size:12.5px;border:1px solid #9f9f9f;background:#fff;color:#222;padding:6px 10px;cursor:pointer}
        .print-fitbar button.active{background:#8B3332;border-color:#8B3332;color:#fff}
        .print-fitbar label{font-size:12.5px;color:#222}
        .print-fitbar input[type=range]{width:180px;accent-color:#8B3332}
        .print-fit-status{margin-top:6px;font-size:12px;font-weight:700}
        .print-fit-status.ok{color:#245c31}
        .print-fit-status.warn{color:#7a2925}
        @media print{.print-fitbar{display:none!important}}
      `}</style>
    </>
  );
}
