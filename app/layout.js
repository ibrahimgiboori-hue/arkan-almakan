import './globals.css';
import './ui-active-skin.css';
import './print-captain-hardening.css';
import { Suspense } from 'react';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import QuoteTerminologyFix from '@/components/QuoteTerminologyFix';
import ActiveUISkinRuntime from '@/components/ui/ActiveUISkinRuntime';
import LatinDigitsRuntime from '@/components/LatinDigitsRuntime';
import { SYSTEM_VERSION } from '@/lib/system-constitution';
import { uiSkinDataAttributes } from '@/lib/ui-skin-contract';
import { ACTIVE_UI_SKIN_KEY } from '@/lib/ui-active-skin';

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex',
});

export const metadata = {
  title: 'أركان المكان — النظام الإداري',
  description: 'نظام إدارة شركة أركان المكان للمقاولات',
};

export default function RootLayout({ children }) {
  const skinAttrs = uiSkinDataAttributes(ACTIVE_UI_SKIN_KEY);

  return (
    <html
      {...skinAttrs}
      lang="ar-SA-u-ca-gregory-nu-latn"
      dir="rtl"
      data-system-constitution="v2"
      data-system-version={SYSTEM_VERSION}
      data-numeral-system="latn"
      className={plex.variable}
      style={{
        '--font-display': 'var(--font-plex)',
        '--font-body': 'var(--font-plex)',
      }}
    >
      <body style={{fontVariantNumeric:'lining-nums tabular-nums'}}>
        <LatinDigitsRuntime />
        <QuoteTerminologyFix />
        <Suspense fallback={null}>
          <ActiveUISkinRuntime />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
