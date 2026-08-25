// الترقيم الهرمي والإجماليات — نفس منطق القاعدة، للعرض الفوري في المحرر
import { SYSTEM, roundValue } from './system-constitution';

export function numberLines(lines) {
  let top = 0, sub = 0, inTitle = false;
  return lines.map((l) => {
    let number = '';
    if (l.kind === 'title') { top += 1; sub = 0; inTitle = true; number = String(top); }
    else if (l.kind === 'note') { number = ''; }
    else if (inTitle) { sub += 1; number = `${top}-${sub}`; }
    else { top += 1; number = String(top); }
    return { ...l, number };
  });
}

export function lineTotal(l, showQty) {
  if (l.kind !== 'item') return 0;
  const lineQty = showQty ? Number(l.qty || 0) : 1;
  return roundValue(lineQty * Number(l.unit_price || 0));
}

export function titleSubtotals(lines, showQty) {
  const out = {};
  let current = null;
  lines.forEach((l) => {
    if (l.kind === 'title') { current = l.id; out[current] = 0; }
    else if (l.kind === 'item' && current) out[current] = roundValue(out[current] + lineTotal(l, showQty));
  });
  return out;
}

export function totals(q, lines) {
  const linesSum = roundValue(lines.reduce((t, l) => t + lineTotal(l, q.show_qty), 0));
  const discount = roundValue(linesSum * Number(q.discount_pct || 0))
                 + Number(q.discount_amount || 0);
  const net = roundValue(linesSum - discount);
  const rate = Number(q.vat_rate ?? SYSTEM.vatRate);
  let subtotal = net, vat = 0, grand = net;

  if (q.vat_mode === 'exclusive') {
    vat = roundValue(net * rate);
    grand = roundValue(net + vat);
  } else if (q.vat_mode === 'inclusive') {
    subtotal = roundValue(net / (1 + rate));
    vat = roundValue(net - subtotal);
    grand = net;
  }
  return { linesSum, discount:roundValue(discount), subtotal, vat, grand };
}

export const VAT_AR = {
  exclusive: 'الضريبة تُضاف على الأسعار',
  inclusive: 'الأسعار شاملة الضريبة',
  none: 'بلا ضريبة',
};

export const QSTATUS_AR = {
  draft:'مسودة', sent:'مُرسل', accepted:'مقبول',
  rejected:'مرفوض', expired:'منتهي الصلاحية', converted:'تحوّل لعقد',
};
