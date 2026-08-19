'use client';

import { Children } from 'react';
import { supabase } from '@/lib/supabase';
import {
  PRINT_GOVERNANCE_VERSION,
  getPrintDefinition,
  getPrintLayoutPolicy,
  printGovernanceClassName,
} from '@/lib/print-governance';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

export default function ConstitutionPagedFrame({
  documentKey,
  cfg,
  children,
  showLetterhead = true,
  contentTopMm,
  contentBottomMm,
  contentSideMm,
  pageClassName = '',
  contentClassName = '',
  showPageNumbers = true,
  renderOverlay,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}) {
  const definition = getPrintDefinition(documentKey);
  const layout = getPrintLayoutPolicy(documentKey);
  const pages = Children.toArray(children);
  const pageCount = pages.length;

  const top = Number(contentTopMm ?? layout.topMm ?? cfg?.letterhead_top_mm ?? 47);
  const bottom = Number(contentBottomMm ?? layout.bottomMm ?? cfg?.letterhead_bottom_mm ?? 39);
  const side = clamp(
    contentSideMm ?? layout.sideMm ?? cfg?.letterhead_side_mm ?? 19,
    10,
    24,
  );

  const full = showLetterhead ? assetUrl(cfg?.letterhead_image_path) : null;
  const header = !full && showLetterhead ? assetUrl(cfg?.header_image_path) : null;
  const footer = !full && showLetterhead ? assetUrl(cfg?.footer_image_path) : null;
  const watermark = !full && showLetterhead ? assetUrl(cfg?.watermark_image_path) : null;
  const classes = printGovernanceClassName(documentKey);

  return (
    <div
      className="constitution-paged-pages"
      data-print-pages={pageCount}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      {pages.map((page, pageIndex) => (
        <section
          className={`constitution-paged-sheet ${pageClassName}`.trim()}
          key={page.key || pageIndex}
        >
          <div className="constitution-paged-assets" aria-hidden="true">
            {full && <img src={full} className="constitution-paged-full" alt="" />}
            {header && (
              <img
                src={header}
                className="constitution-paged-header"
                alt=""
                style={{ height:`${Number(cfg?.header_height_mm || 40)}mm` }}
              />
            )}
            {footer && (
              <img
                src={footer}
                className="constitution-paged-footer"
                alt=""
                style={{ height:`${Number(cfg?.footer_height_mm || 32)}mm` }}
              />
            )}
            {watermark && <img src={watermark} className="constitution-paged-watermark" alt="" />}
          </div>

          <main
            className={`constitution-paged-content ${contentClassName}`.trim()}
            style={{ padding:`${top}mm ${side}mm ${bottom}mm` }}
          >
            <div
              className={classes}
              data-print-document={documentKey}
              data-print-family={definition.family}
              data-print-status={definition.status}
              data-print-governance-version={PRINT_GOVERNANCE_VERSION}
            >
              {page}
            </div>
          </main>

          {showPageNumbers && pageCount > 0 && (
            <div
              className="constitution-paged-number"
              style={{ bottom:`${Math.max(2, bottom - 5)}mm` }}
            >
              صفحة {pageIndex + 1} من {pageCount}
            </div>
          )}

          {renderOverlay?.({ pageIndex, pageCount })}
        </section>
      ))}

      <style jsx global>{`
        .constitution-paged-pages{padding:24px 14px 60px;display:flex;flex-direction:column;align-items:center;gap:20px;background:#efeaea}
        .constitution-paged-sheet{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.16)}
        .constitution-paged-sheet.dragging{cursor:grabbing;user-select:none}
        .constitution-paged-assets{position:absolute;inset:0;z-index:0;pointer-events:none}
        .constitution-paged-full{position:absolute;inset:0;width:210mm;height:297mm;object-fit:fill;display:block}
        .constitution-paged-header{position:absolute;top:0;right:0;width:210mm;object-fit:fill;display:block}
        .constitution-paged-footer{position:absolute;bottom:0;right:0;width:210mm;object-fit:fill;display:block}
        .constitution-paged-watermark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:120mm;max-height:160mm;object-fit:contain;display:block}
        .constitution-paged-content{position:relative;z-index:1;width:210mm;height:297mm;box-sizing:border-box;direction:rtl;text-align:right;font-size:9pt;line-height:1.45;overflow:hidden}
        .constitution-paged-content>.print-constitution{width:100%;min-width:0}
        .constitution-paged-number{position:absolute;z-index:4;right:0;left:0;text-align:center;font-size:7.5pt;color:#6b6b6d;pointer-events:none}
        @media print{
          .constitution-paged-pages{padding:0;gap:0;background:#fff;display:block}
          .constitution-paged-sheet{width:210mm;height:297mm;box-shadow:none;margin:0;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}
          .constitution-paged-sheet:last-child{break-after:auto;page-break-after:auto}
        }
      `}</style>
    </div>
  );
}
