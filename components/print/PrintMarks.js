'use client';

import { supabase } from '@/lib/supabase';

const assetUrl = (path) => path
  ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl
  : null;

function markProps(rawProps = {}) {
  const { style, ...props } = rawProps || {};
  return { props, style: style || {} };
}

export function PrintMark({
  cfg,
  kind = 'stamp',
  show = true,
  sizeMm,
  mode = 'overlay',
  style,
  imageProps,
}) {
  const isSignature = kind === 'signature';
  const path = isSignature ? cfg?.signature_image_path : cfg?.stamp_image_path;
  const src = show ? assetUrl(path) : null;
  const dom = markProps(imageProps);
  const interactive = Boolean(dom.props.onPointerDown);
  if (!src) return null;

  const resolvedSize = Number(sizeMm ?? (isSignature ? cfg?.signature_size_mm ?? 21 : cfg?.stamp_size_mm ?? 30));
  const overlay = mode === 'overlay';
  const className = overlay
    ? (isSignature ? 'print-master-signature' : 'print-master-stamp')
    : (isSignature ? 'print-inline-signature' : 'print-inline-stamp');

  return (
    <img
      src={src}
      className={className}
      alt=""
      aria-hidden="true"
      {...dom.props}
      style={{
        ...(overlay
          ? { width:`${resolvedSize}mm` }
          : { height:`${resolvedSize}mm`, width:'auto', maxWidth:'100%', objectFit:'contain', display:'block' }),
        ...(interactive ? { pointerEvents:'auto', cursor:'move', touchAction:'none' } : {}),
        ...(style || {}),
        ...dom.style,
      }}
    />
  );
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
  return (
    <>
      <PrintMark
        cfg={cfg}
        kind="stamp"
        show={showStamp}
        sizeMm={stampSizeMm}
        style={stampStyle}
        imageProps={stampProps}
      />
      <PrintMark
        cfg={cfg}
        kind="signature"
        show={showSignature}
        sizeMm={signatureSizeMm}
        style={signatureStyle}
        imageProps={signatureProps}
      />
    </>
  );
}
