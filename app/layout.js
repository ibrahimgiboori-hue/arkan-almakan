import './globals.css';
import './ui-skin-tokens.css';
import './ui-external-skin.css';
import './ui-signature-skin.css';
import './ui-signature-tailoring.css';
import './ui-signature-photo-skin.css';
import './ui-signature-project-scenes.css';
import { Suspense } from 'react';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import QuoteTerminologyFix from '@/components/QuoteTerminologyFix';
import SignatureProjectSceneRuntime from '@/components/ui/SignatureProjectSceneRuntime';
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
      lang="ar"
      dir="rtl"
      data-system-constitution="v2"
      data-system-version={SYSTEM_VERSION}
      className={plex.variable}
      style={{
        '--font-display': 'var(--font-plex)',
        '--font-body': 'var(--font-plex)',
      }}
    >
      <body>
        <QuoteTerminologyFix />
        <Suspense fallback={null}>
          <SignatureProjectSceneRuntime />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
