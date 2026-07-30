import './globals.css';
import { Reem_Kufi, IBM_Plex_Sans_Arabic } from 'next/font/google';

const display = Reem_Kufi({
  subsets: ['arabic', 'latin'],
  variable: '--font-display',
});

const body = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
});

export const metadata = {
  title: 'أركان المكان — النظام الإداري',
  description: 'نظام إدارة شركة أركان المكان للمقاولات',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
