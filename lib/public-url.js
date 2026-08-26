const DEFAULT_PUBLIC_APP_ORIGIN = 'https://my.arkanalmakansa.com';

export const PUBLIC_APP_ORIGIN = String(
  process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_ORIGIN
).trim().replace(/\/+$/, '');

export function publicAppUrl(path = '/', runtimeOrigin = '') {
  const normalized = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  const origin = String(PUBLIC_APP_ORIGIN || runtimeOrigin || DEFAULT_PUBLIC_APP_ORIGIN).trim().replace(/\/+$/, '');
  return `${origin}${normalized}`;
}

export function isCanonicalPublicHost(hostname = '') {
  try {
    return new URL(PUBLIC_APP_ORIGIN).hostname === String(hostname || '').toLowerCase();
  } catch {
    return false;
  }
}
