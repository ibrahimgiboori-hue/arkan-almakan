const DEFAULT_PUBLIC_APP_ORIGIN = 'https://arkanalmakansa.com';

export const PUBLIC_APP_ORIGIN = String(
  process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_ORIGIN
).replace(/\/+$/, '');

export function publicAppUrl(path = '/') {
  const normalized = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  return `${PUBLIC_APP_ORIGIN}${normalized}`;
}

export function isCanonicalPublicHost(hostname = '') {
  try {
    return new URL(PUBLIC_APP_ORIGIN).hostname === String(hostname || '').toLowerCase();
  } catch {
    return false;
  }
}
