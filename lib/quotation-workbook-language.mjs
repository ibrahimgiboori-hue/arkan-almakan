const EN_LABELS = new Map([
  ['العميل','Client'],
  ['المرجع وتفاصيل المشروع','Project / Reference'],
  ['الرقم المرجعي','Quotation No.'],
  ['التاريخ / الصلاحية','Date / Validity'],
  ['م','No.'], ['بيان الأعمال','Description of Works'],
  ['الوحدة','Unit'], ['الكمية','Qty'],
  ['الفئة','Unit Rate'], ['القيمة / الفئة','Unit Rate'],
  ['الإجمالي','Amount'], ['الإجمالي الجزئي','Subtotal'], ['الإجمالي الكلي','Grand Total'],
  ['ضريبة القيمة المضافة','VAT'],
  ['شروط الدفع','Payment Terms'], ['الشروط والأحكام العامة','Terms & Conditions'],
  ['قبول العميل / التوقيع','Client Acceptance / Signature'],
  ['ممثل أركان المكان','Arkan Representative'], ['تفاصيل الحساب البنكي','Bank Details'],
]);
const EN_UNITS = new Map([
  ['م2','m²'], ['م²','m²'], ['م3','m³'], ['م³','m³'], ['م','m'],
  ['م طولي','LM'], ['م.ط','LM'], ['عدد','No.'], ['قطعة','No.'],
  ['يوم','Day'], ['ساعة','Hour'], ['طن','Ton'], ['كجم','kg'],
  ['لتر','L'], ['مقطوعية','Lump Sum'], ['عامل','Worker'],
]);
const EN_BANKS = new Map([
  ['مصرف الراجحي','Al Rajhi Bank'], ['بنك الراجحي','Al Rajhi Bank'],
]);

export function singleLineText(value) {
  return String(value ?? '').replace(/\\r\\n|\\n/g,' ').replace(/\s+/g,' ').trim();
}

export function englishQuoteUnit(value) {
  return EN_UNITS.get(String(value || '').trim()) || String(value || '');
}

export function englishQuoteBank(value) {
  return EN_BANKS.get(String(value || '').trim()) || String(value || '');
}

export function quotationWorkbookCell(cell, { language='ar',values={},variables=[] } = {}) {
  if (language !== 'en') return cell;
  const sourceText = String(cell.sourceText ?? cell.text ?? '');
  let text = sourceText.replace(/\\r\\n|\\n/g,'\n').replace(/\r\n/g,'\n');
  const raw = text.trim();
  if (['عرض سعر / جدول كميات','عرض سعر مقطوعية'].includes(raw)) {
    text = values.document_title || 'QUOTATION';
  } else if (EN_LABELS.has(raw)) {
    text = raw === 'التاريخ / الصلاحية' && values.valid_days === '' ? 'Date' : EN_LABELS.get(raw);
  } else if (/^ضريبة القيمة المضافة\s*[\d.]+%$/.test(raw)) {
    text = `VAT (${values.vat_rate || raw.match(/[\d.]+%/)[0]})`;
  } else if (/^(الاسم|التوقيع|التاريخ):/.test(raw)) {
    text = raw.replace(/^(الاسم|التوقيع|التاريخ):/,(_match,label) => `${({الاسم:'Name',التوقيع:'Signature',التاريخ:'Date'})[label]}:`);
  } else if (!cell.tokens?.length) {
    const variable = variables.find((item) => item.labelAr === raw && item.labelEn);
    if (variable) text = variable.labelEn;
  }
  if (cell.tokens?.includes('valid_days')) text = text.replace(/يوم(?:اً|ًا|ا)?(?=\s|$)/g,'days');
  if (cell.tokens?.includes('description_ar') && cell.tokens?.includes('description_en')) {
    text = text.replace(/\{\{description_ar\}\}\s*(?:[/|]\s*)?\{\{description_en\}\}/g,'{{description_ar}}');
  }
  return { ...cell,sourceText,text };
}
