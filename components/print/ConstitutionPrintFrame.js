'use client';

import { Children, cloneElement, isValidElement } from 'react';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';

const finiteMm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function mergeClassName(base, extra) {
  return [base, extra].filter(Boolean).join(' ').trim();
}

/**
 * Compatibility adapter for documents that still render one continuous body.
 *
 * IMPORTANT: this component deliberately owns no paper geometry, no layout
 * persistence and no independent toolbar. The physical page, safe footer,
 * grid editor, letterhead and pagination all belong to ConstitutionPagedFrame
 * (the Print Captain). Keeping this adapter thin prevents a second print
 * mechanism from growing beside the captain while legacy callers migrate.
 *
 * The adapter must also stay transparent to pagination. Wrapping a single
 * document root in another div makes the captain see the entire document as
 * one giant block. In that failure mode the browser, not the captain, fragments
 * the physical sheet and continuation content can start inside letterhead or
 * footer artwork. A single child is therefore passed through as the real flow
 * root, with any adapter class merged onto that child instead of adding a new
 * pagination layer.
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

  const childArray = Children.toArray(children);
  const flowChildren = childArray.length === 1 && isValidElement(childArray[0])
    ? cloneElement(childArray[0], {
        className:mergeClassName(childArray[0].props.className, className),
      })
    : <div className={className}>{childArray}</div>;

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
      {flowChildren}
    </ConstitutionPagedFrame>
  );
}
