'use client';

import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';

const finiteMm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Compatibility adapter for documents that still render one continuous body.
 *
 * IMPORTANT: this component deliberately owns no paper geometry, no layout
 * persistence and no independent toolbar. The physical page, safe footer,
 * grid editor, letterhead and pagination all belong to ConstitutionPagedFrame
 * (the Print Captain). Keeping this adapter thin prevents a second print
 * mechanism from growing beside the captain while legacy callers migrate.
 *
 * A document/template may request MORE white space, but it must never shrink
 * the physical safe area reserved by the approved letterhead. This is the
 * constitutional guard that keeps content out of the header/footer artwork.
 */
export default function ConstitutionPrintFrame({
  documentKey,
  className = '',
  children,
  cfg,
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
  contentLeftMm,
  contentRightMm,
  ...rest
}) {
  const layout = getPrintLayoutPolicy(documentKey);
  const requestedTop = contentTopMm ?? layout.topMm;
  const requestedBottom = contentBottomMm ?? layout.bottomMm;
  const letterheadTop = finiteMm(cfg?.letterhead_top_mm);
  const letterheadBottom = finiteMm(cfg?.letterhead_bottom_mm);
  const safeTop = Math.max(finiteMm(requestedTop), letterheadTop) || undefined;
  const safeBottom = Math.max(finiteMm(requestedBottom), letterheadBottom) || undefined;

  return (
    <ConstitutionPagedFrame
      {...rest}
      documentKey={documentKey}
      cfg={cfg}
      showLetterhead={showLetterhead}
      showStamp={showStamp}
      showSignature={showSignature}
      stampSizeMm={stampSizeMm}
      signatureSizeMm={signatureSizeMm}
      stampStyle={stampStyle}
      signatureStyle={signatureStyle}
      contentTopMm={safeTop}
      contentBottomMm={safeBottom}
      contentSideMm={contentSideMm ?? layout.sideMm}
      contentLeftMm={contentLeftMm}
      contentRightMm={contentRightMm}
      showPageNumbers={false}
      autoPaginate
      pageClassName="print-page"
      contentClassName="print-content"
    >
      <div className={className}>{children}</div>
    </ConstitutionPagedFrame>
  );
}
