'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

const MIN_DENSITY = 84;
const MAX_DENSITY = 104;
const MIN_SIDE_MM = 10;
const MAX_SIDE_MM = 24;

const clamp = (v,min,max) => Math.min(max,Math.max(min,Number(v)));

export default function PrintFrame({
  cfg,
  children,
  showLetterhead = true,
  showStamp = false,
  showSignature = false,
  stampSizeMm,
  signatureSizeMm,
  stampStyle,
  signatureStyle,
  contentTopMm,
  contentBottomMm,
  contentSideMm,
  layoutEditing = false,
  onContentSideChange,
}) {
  const top = Number(contentTopMm ?? cfg?.letterhead_top_mm ?? 47);
  const bottom = Number(contentBottomMm ?? cfg?.letterhead_bottom_mm ?? 39);
  const side = clamp(contentSideMm ?? cfg?.letterhead_side_mm ?? 19, MIN_SIDE_MM, MAX_SIDE_MM);

  const full = showLetterhead ? assetUrl(cfg?.letterhead_image_path) : null;
  const header = !full && showLetterhead ? assetUrl(cfg?.header_image_path) : null;
  const footer = !full && showLetterhead ? assetUrl(cfg?.footer_image_path) : null;
  const watermark = !full && showLetterhead ? assetUrl(cfg?.watermark_image_path) : null;
  const stamp = showStamp ? assetUrl(cfg?.stamp_image_path) : null;
  const signature = showSignature ? assetUrl(cfg?.signature_image_path) : null;

  const pageRef = useRef(null);
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
    const used = inner.getBoundingClientRect().height;
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

    const resize = new ResizeObserver(() => window.requestAnimationFrame(evaluateFit));
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

  function startMarginDrag(edge, event) {
    if (!layoutEditing || !onContentSideChange) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startSide = side;
    const pageWidthPx = pageRef.current?.getBoundingClientRect().width || 794;
    const pxPerMm = pageWidthPx / 210;

    const move = (moveEvent) => {
      const deltaMm = (moveEvent.clientX - startX) / pxPerMm;
      const next = edge === 'left'
        ? startSide + deltaMm
        : startSide - deltaMm;
      onContentSideChange(clamp(Math.round(next * 10) / 10, MIN_SIDE_MM, MAX_SIDE_MM));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const scale = density / 100;
  const compensatedWidth = `${100 / scale}%`;

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
        <div ref={pageRef} className="print-page">
          <div className="print-assets" aria-hidden="true">
            {full && <img src={full} className="print-master-full" alt="" />}
            {header && <img src={header} className="print-master-header" alt="" style={{height:`${Number(cfg?.header_height_mm || 40)}mm`}} />}
            {footer && <img src={footer} className="print-master-footer" alt="" style={{height:`${Number(cfg?.footer_height_mm || 32)}mm`}} />}
            {watermark && <img src={watermark} className="print-master-watermark" alt="" />}
          </div>

          {layoutEditing && <>
            <div
              className="print-margin-guide print-margin-guide-right no-print"
              style={{right:`${side}mm`,top:`${top}mm`,bottom:`${bottom}mm`}}
              onPointerDown={(e)=>startMarginDrag('right',e)}
              title="اسحب لضبط الهامش الجانبي بصورة موزونة"
            />
            <div
              className="print-margin-guide print-margin-guide-left no-print"
              style={{left:`${side}mm`,top:`${top}mm`,bottom:`${bottom}mm`}}
              onPointerDown={(e)=>startMarginDrag('left',e)}
              title="اسحب لضبط الهامش الجانبي بصورة موزونة"
            />
          </>}

          <main ref={mainRef} className="print-content" style={{padding:`${top}mm ${side}mm ${bottom}mm`}}>
            <div
              ref={innerRef}
              className="print-fit-content"
              style={{ zoom:scale, width:compensatedWidth }}
            >
              {children}
            </div>
          </main>
          {stamp && <img src={stamp} className="print-master-stamp" alt="" style={{width:`${Number(stampSizeMm ?? cfg?.stamp_size_mm ?? 30)}mm`, ...(stampStyle || {})}} />}
          {signature && <img src={signature} className="print-master-signature" alt="" style={{width:`${Number(signatureSizeMm ?? cfg?.signature_size_mm ?? 21)}mm`, ...(signatureStyle || {})}} />}
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
        .print-margin-guide{position:absolute;z-index:12;width:9px;cursor:ew-resize;transform:translateX(50%);background:transparent}
        .print-margin-guide-left{transform:translateX(-50%)}
        .print-margin-guide::after{content:'';position:absolute;top:0;bottom:0;left:4px;border-left:1px dashed rgba(139,51,50,.34)}
        .print-margin-guide::before{content:'';position:absolute;top:50%;left:1px;width:7px;height:20mm;transform:translateY(-50%);border-left:2px solid rgba(139,51,50,.34);border-right:2px solid rgba(139,51,50,.34)}
        .print-margin-guide:hover::after,.print-margin-guide:hover::before{border-color:rgba(139,51,50,.72)}
        @media print{.print-fitbar,.print-margin-guide{display:none!important}}
      `}</style>
    </>
  );
}
