import './globals.css';
import { Alexandria, Readex_Pro } from 'next/font/google';
import QuoteTerminologyFix from '@/components/QuoteTerminologyFix';
import { SYSTEM_VERSION } from '@/lib/system-constitution';

const alexandria = Alexandria({
  subsets: ['arabic', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-alexandria',
});

const readex = Readex_Pro({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-readex',
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
      className={`${alexandria.variable} ${readex.variable}`}
      style={{
        '--font-display': 'var(--font-alexandria)',
        '--font-body': 'var(--font-readex)',
      }}
    >
      <body>
        <QuoteTerminologyFix />
        {children}
      </body>
    </html>
  );
}
