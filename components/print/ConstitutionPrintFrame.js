'use client';

import { Children, Fragment, cloneElement, isValidElement } from 'react';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import ProjectReportJourneyPrint from '@/components/print/ProjectReportJourneyPrint';

function mergeClassName(base, extra) {
  return [base, extra].filter(Boolean).join(' ').trim();
}

function flattenRenderedBlocks(nodes) {
  return Children.toArray(nodes).flatMap((node) => {
    if (!isValidElement(node)) return [node];
    if (node.type === Fragment) return flattenRenderedBlocks(node.props.children);
    return [node];
  });
}

/**
 * القبطان يستقبل تيار المحتوى الحقيقي لا غلافًا صناعيًا حوله.
 * الرحلات المركبة التي تنتج عدة كتل تُفك قبل القياس حتى تبقى حدود React وDOM متطابقة.
 * هندسة الورقة، Word baseline، الليترهيد، الاتجاه، مناطق الأمان والتقسيم كلها ملك ConstitutionPagedFrame وحده.
 */
function expandCaptainFlowBlocks(nodes) {
  return Children.toArray(nodes).flatMap((node) => {
    if (!isValidElement(node)) return [node];
    if (node.type === Fragment) return expandCaptainFlowBlocks(node.props.children);
    if (node.type === ProjectReportJourneyPrint) {
      const rendered = ProjectReportJourneyPrint(node.props);
      if (!isValidElement(rendered)) return [rendered];
      return flattenRenderedBlocks(rendered.props.children);
    }
    return [node];
  });
}

export default function ConstitutionPrintFrame({
  documentKey,
  className = '',
  children,
  cfg,
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
  const childArray = Children.toArray(children);
  const flowChildren = childArray.length === 1 && isValidElement(childArray[0])
    ? cloneElement(childArray[0], {
        className:mergeClassName(childArray[0].props.className, className),
      }, expandCaptainFlowBlocks(childArray[0].props.children))
    : <div className={className}>{expandCaptainFlowBlocks(childArray)}</div>;

  return (
    <ConstitutionPagedFrame
      {...rest}
      documentKey={documentKey}
      cfg={cfg}
      showStamp={showStamp}
      showSignature={showSignature}
      stampSizeMm={stampSizeMm}
      signatureSizeMm={signatureSizeMm}
      stampStyle={stampStyle}
      signatureStyle={signatureStyle}
      contentTopMm={contentTopMm}
      contentBottomMm={contentBottomMm}
      contentSideMm={contentSideMm}
      contentLeftMm={contentLeftMm}
      contentRightMm={contentRightMm}
      showPageNumbers={false}
      pageClassName="print-page"
      contentClassName="print-content"
    >
      {flowChildren}
    </ConstitutionPagedFrame>
  );
}
