// تفقيط المبالغ بالعربية — حماية نظامية من تحريف الأرقام

const ONES = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة',
  'أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const TENS = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
const HUNDREDS = ['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];

function under1000(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(ONES[r]);
    else {
      const o = r % 10, t = Math.floor(r / 10);
      parts.push(o ? ONES[o] + ' و' + TENS[t] : TENS[t]);
    }
  }
  return parts.join(' و');
}

function group(n, one, two, plural) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return under1000(n) + ' ' + plural;
  return under1000(n) + ' ' + one;
}

function intToWords(n) {
  if (n === 0) return 'صفر';
  const out = [];
  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const rest = n % 1000;
  if (millions) out.push(group(millions, 'مليون', 'مليونان', 'ملايين'));
  if (thousands) out.push(group(thousands, 'ألف', 'ألفان', 'آلاف'));
  if (rest) out.push(under1000(rest));
  return out.join(' و');
}

export function tafqit(amount) {
  const num = Number(amount || 0);
  const riyals = Math.floor(num);
  const halalas = Math.round((num - riyals) * 100);
  let s = intToWords(riyals) + ' ريال سعودي';
  if (halalas > 0) s += ' و' + intToWords(halalas) + ' هللة';
  return s + ' لا غير';
}
