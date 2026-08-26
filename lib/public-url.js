export const PUBLIC_APP_ORIGIN = String(
  process.env.NEXT_PUBLIC_APP_URL || ''
).trim().replace(/\/+$/, '');

export function publicAppUrl(path = '/', runtimeOrigin = '') {
  const normalized = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  const origin = String(PUBLIC_APP_ORIGIN || runtimeOrigin || '').trim().replace(/\/+$/, '');
  return origin ? `${origin}${normalized}` : normalized;
}

export function isCanonicalPublicHost(hostname = '') {
  if (!PUBLIC_APP_ORIGIN) return false;
  try {
    return new URL(PUBLIC_APP_ORIGIN).hostname === String(hostname || '').toLowerCase();
  } catch {
    return false;
  }
}
