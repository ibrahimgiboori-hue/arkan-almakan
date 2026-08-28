'use client';

import { supabase } from '@/lib/supabase';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

function markProps(rawProps = {}) {
  const { style, ...props } = rawProps || {};
  return { props, style: style || {} };
}

export default function PrintMarks({
  cfg,
  showStamp = false,
  showSignature = false,
  stampSizeMm,
  signatureSizeMm,
  stampStyle,
  signatureStyle,
  stampProps,
  signatureProps,
}) {
  const stamp = showStamp ? assetUrl(cfg?.stamp_image_path) : null;
  const signature = showSignature ? assetUrl(cfg?.signature_image_path) : null;
  const stampDom = markProps(stampProps);
  const signatureDom = markProps(signatureProps);
  const stampInteractive = Boolean(stampDom.props.onPointerDown);
  const signatureInteractive = Boolean(signatureDom.props.onPointerDown);

  if (!stamp && !signature) return null;

  return (
    <>
      {stamp && (
        <img
          src={stamp}
          className="print-master-stamp"
          alt=""
          aria-hidden="true"
          {...stampDom.props}
          style={{
            width:`${Number(stampSizeMm ?? cfg?.stamp_size_mm ?? 30)}mm`,
            ...(stampInteractive ? { pointerEvents:'auto', cursor:'move', touchAction:'none' } : {}),
            ...(stampStyle || {}),
            ...stampDom.style,
          }}
        />
      )}
      {signature && (
        <img
          src={signature}
          className="print-master-signature"
          alt=""
          aria-hidden="true"
          {...signatureDom.props}
          style={{
            width:`${Number(signatureSizeMm ?? cfg?.signature_size_mm ?? 21)}mm`,
            ...(signatureInteractive ? { pointerEvents:'auto', cursor:'move', touchAction:'none' } : {}),
            ...(signatureStyle || {}),
            ...signatureDom.style,
          }}
        />
      )}
    </>
  );
}
