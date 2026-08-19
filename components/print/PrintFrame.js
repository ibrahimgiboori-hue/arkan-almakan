'use client';
import { supabase } from '@/lib/supabase';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

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

  return (
    <div className="print-page-wrap">
      <div className="print-page">
        <div className="print-assets" aria-hidden="true">
          {full && <img src={full} className="print-master-full" alt="" />}
          {header && <img src={header} className="print-master-header" alt="" style={{height:`${Number(cfg?.header_height_mm || 40)}mm`}} />}
          {footer && <img src={footer} className="print-master-footer" alt="" style={{height:`${Number(cfg?.footer_height_mm || 32)}mm`}} />}
          {watermark && <img src={watermark} className="print-master-watermark" alt="" />}
          {stamp && <img src={stamp} className="print-master-stamp" alt="" style={{width:`${Number(stampSizeMm ?? cfg?.stamp_size_mm ?? 30)}mm`}} />}
        </div>
        <main className="print-content" style={{padding:`${top}mm ${side}mm ${bottom}mm`}}>
          {children}
        </main>
      </div>
    </div>
  );
}
