'use client';

import { Children, Fragment, cloneElement, isValidElement, useCallback, useEffect, useState } from 'react';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import DocumentContentRoot from '@/components/print/DocumentContentRoot';
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
 * جسم المحتوى المرئي نفسه واحد ومستمر؛ DocumentContentRoot يربط كتل المحتوى بشبكة 48×2 مم.
 * الحوارات والمحررات وأدوات الإدخال تبقى خارج هذا الجسم ولا تدخل شجرة الطباعة.
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

function governedContentBody(documentKey,className,childArray,onLayoutSettled,layoutRevision){
  if(childArray.length===1&&isValidElement(childArray[0])){
    const root=childArray[0];
    if(typeof root.type==='string'){
      return (
        <DocumentContentRoot
          as={root.type}
          documentKey={documentKey}
          rootProps={root.props}
          className={mergeClassName(root.props.className,className)}
          onLayoutSettled={onLayoutSettled}
          layoutRevision={layoutRevision}
        >
          {expandCaptainFlowBlocks(root.props.children)}
        </DocumentContentRoot>
      );
    }
    // المركبات المتخصصة التي تدير DOM خاصًا بها تبقى كما هي إلى أن تنتقل صراحة إلى عقد الجسم الواحد.
    return cloneElement(root,{
      className:mergeClassName(root.props.className,className),
    },expandCaptainFlowBlocks(root.props.children));
  }
  return (
    <DocumentContentRoot
      documentKey={documentKey}
      className={className}
      onLayoutSettled={onLayoutSettled}
      layoutRevision={layoutRevision}
    >
      {expandCaptainFlowBlocks(childArray)}
    </DocumentContentRoot>
  );
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
  ...rest
}) {
  const [layoutRevision,setLayoutRevision]=useState(0);
  const onLayoutSettled=useCallback(()=>setLayoutRevision((value)=>value+1),[]);

  useEffect(()=>{
    const refresh=()=>setLayoutRevision((value)=>value+1);
    window.addEventListener('arkan:print-content-layout-changed',refresh);
    return ()=>window.removeEventListener('arkan:print-content-layout-changed',refresh);
  },[]);

  const childArray = Children.toArray(children);
  const flowChildren = governedContentBody(documentKey,className,childArray,onLayoutSettled,layoutRevision);

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
      showPageNumbers={false}
      pageClassName="print-page"
      contentClassName="print-content"
      dataDocumentLayoutRevision={layoutRevision}
    >
      {flowChildren}
    </ConstitutionPagedFrame>
  );
}
