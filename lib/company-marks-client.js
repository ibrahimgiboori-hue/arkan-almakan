'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { COMPANY_MARK_SIGNED_SECONDS, companyMarkLocation } from '@/lib/company-marks.mjs';

// One place resolves the stamp/signature image for every screen and print.
// Private marks need a short signed link that the database grants only to whoever may apply them.
const cache = new Map();

export async function resolveCompanyMarkUrl(path) {
  const location = companyMarkLocation(path);
  if (!location) return null;
  if (!location.private) return supabase.storage.from(location.bucket).getPublicUrl(location.key).data.publicUrl;
  const cached = cache.get(location.key);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.key, COMPANY_MARK_SIGNED_SECONDS);
  if (error || !data?.signedUrl) return null;
  cache.set(location.key, { url: data.signedUrl, expires: Date.now() + (COMPANY_MARK_SIGNED_SECONDS - 60) * 1000 });
  return data.signedUrl;
}

/** { url, state: 'loading' | 'ready' | 'denied' | 'none' } for a stored mark path. */
export function useCompanyMarkUrl(path, enabled = true) {
  const [result, setResult] = useState({ url: null, state: path && enabled ? 'loading' : 'none' });
  useEffect(() => {
    let alive = true;
    if (!path || !enabled) { setResult({ url: null, state: 'none' }); return () => { alive = false; }; }
    setResult({ url: null, state: 'loading' });
    resolveCompanyMarkUrl(path)
      .then((url) => { if (alive) setResult(url ? { url, state: 'ready' } : { url: null, state: 'denied' }); })
      .catch(() => { if (alive) setResult({ url: null, state: 'denied' }); });
    return () => { alive = false; };
  }, [path, enabled]);
  return result;
}

export function clearCompanyMarkCache() {
  cache.clear();
}
