import './globals.css';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';

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
      className={plex.variable}
      style={{
        '--font-display': 'var(--font-plex)',
        '--font-body': 'var(--font-plex)',
      }}
    >
      <body>{children}</body>
    </html>
  );
}
