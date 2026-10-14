import { SYSTEM } from './system-constitution.js';
import { englishQuoteBank,englishQuoteUnit,singleLineText } from './quotation-workbook-language.mjs';

export function buildQuoteWorkbookData({
  quote, numberedLines = [], payments = [], computed = {}, subtotals = {}, settings = {},
  formatMoney = String, formatDate = String,
}) {
  const isEnglish = quote.language === 'en';
  const text = (value) => isEnglish ? singleLineText(value) : String(value || '');
  const first = numberedLines.find((line) => line.kind === 'item');
  const lineRecord = (line) => {
    const item = line.kind === 'item';
    return {
      kind:line.kind,
      item_no:line.number || '',
      description_ar:isEnglish ? text(line.description_en || line.description_ar) : (line.description_ar || ''),
      description_en:isEnglish ? text(line.description_en || line.description_ar) : (line.description_en || ''),
      unit:item ? (isEnglish ? englishQuoteUnit(line.unit) : (line.unit || '')) : '',
      qty:item ? (line.qty ?? '') : '',
      unit_price:item ? formatMoney(Number(line.unit_price || 0)) : '',
      line_total:quote.show_line_total
        ? (item ? formatMoney(line.calculated_total || 0) : (line.kind === 'title' ? formatMoney(subtotals[line.id] || 0) : ''))
        : '',
    };
  };
  const paymentRows = payments.map((payment,index) => ({
    payment_terms:text(`${(isEnglish && payment.label === 'دفعة' ? 'Payment' : payment.label) || (isEnglish ? `Payment ${index+1}` : `الدفعة ${index+1}`)}: ${Number(payment.percent || 0)}%${payment.trigger_note ? ` — ${payment.trigger_note}` : ''}`),
  }));
  const terms = String(quote.terms_text || '').split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
  for (const term of Array.isArray(quote.terms_structured) ? quote.terms_structured : []) {
    const text = [term.title,term.body].filter(Boolean).join('\n').trim();
    if (text) terms.push(text);
  }
  return {
    language:isEnglish ? 'en' : 'ar',
    toggles:{ ...quote },
    repeatGroups:{
      line_items:numberedLines.map(lineRecord),
      payment_terms:paymentRows,
      terms:terms.map((term) => ({ terms:text(term) })),
    },
    values:{
      document_title:quote.title_override || (isEnglish ? (quote.doc_kind==='boq' ? 'BILL OF QUANTITIES' : 'QUOTATION') : 'عرض سعر'),
      quote_no:quote.quote_no || '', quote_date:formatDate(quote.quote_date || ''),
      client_name:isEnglish && quote.client_name==='عميل جديد' ? 'New Client' : (quote.client_name || ''), client_contact:quote.client_contact || '',
      project_ref:quote.project_ref || '', site_location:quote.site_location || '',
      valid_days:quote.show_validity===false ? '' : (quote.valid_days ?? ''),
      intro_text:text(quote.intro_text), closing_text:text(quote.closing_text),
      subtotal:formatMoney(computed.subtotal || 0), vat_rate:`${Number(quote.vat_rate ?? SYSTEM.vatRate)*100}%`,
      vat_amount:formatMoney(computed.vat || 0), grand_total:formatMoney(computed.grand || 0),
      plain_total:formatMoney(computed.grand || 0),
      ...(first ? lineRecord(first) : {}),
      payment_terms:paymentRows.map((row) => row.payment_terms).join('\n'), terms:terms.join('\n'),
      representative_name:quote.arkan_signatory_name || '', representative_title:quote.arkan_signatory_title || '',
      bank_name:isEnglish ? englishQuoteBank(settings.bank_name_full) : (settings.bank_name_full || ''), bank_account_no:settings.bank_account_no || '', bank_iban:settings.bank_iban || '',
    },
  };
}
