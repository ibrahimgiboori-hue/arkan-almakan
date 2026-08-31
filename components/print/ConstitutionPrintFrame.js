'use client';

import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';

/**
 * Compatibility adapter for documents that still render one continuous body.
 *
 * IMPORTANT: this component deliberately owns no paper geometry, no layout
 * persistence and no independent toolbar. The physical page, safe footer,
 * grid editor, letterhead and pagination all belong to ConstitutionPagedFrame
 * (the Print Captain). Keeping this adapter thin prevents a second print
 * mechanism from growing beside the captain while legacy callers migrate.
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
      contentTopMm={contentTopMm ?? layout.topMm}
      contentBottomMm={contentBottomMm ?? layout.bottomMm}
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
