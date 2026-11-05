import './globals.css';
import './ui-active-skin.css';
import './print-captain-hardening.css';
import './print-semantic-roles.css';
import './print-clean-pin-ruler.css';
import { Suspense } from 'react';
// Self-hosted (bundled from npm) so builds never depend on reaching Google Fonts.
import '@fontsource/ibm-plex-sans-arabic/arabic-300.css';
import '@fontsource/ibm-plex-sans-arabic/latin-300.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-700.css';
import QuoteTerminologyFix from '@/components/QuoteTerminologyFix';
import ActiveUISkinRuntime from '@/components/ui/ActiveUISkinRuntime';
import LatinDigitsRuntime from '@/components/LatinDigitsRuntime';
import PrintSemanticRolesRuntime from '@/components/print/PrintSemanticRolesRuntime';
import PrintContentWorkbench from '@/components/print/PrintContentWorkbench';
import { SYSTEM_VERSION } from '@/lib/system-constitution';
import { uiSkinDataAttributes } from '@/lib/ui-skin-contract';
import { ACTIVE_UI_SKIN_KEY } from '@/lib/ui-active-skin';

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
      style={{
        '--font-plex': "'IBM Plex Sans Arabic', system-ui, sans-serif",
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
        <PrintSemanticRolesRuntime />
        <PrintContentWorkbench />
        {children}
      </body>
    </html>
  );
}
