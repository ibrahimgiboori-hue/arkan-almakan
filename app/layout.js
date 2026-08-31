import './globals.css';
import './print-contrast.css';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import QuoteTerminologyFix from '@/components/QuoteTerminologyFix';
import { SYSTEM_VERSION } from '@/lib/system-constitution';

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
  return (
    <html
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
        {children}
      </body>
    </html>
  );
}