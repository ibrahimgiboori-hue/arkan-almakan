// سياسة الفواتير في أركان المكان.
// البرنامج لا يصف أي مستند يصدر منه بأنه «فاتورة ضريبية رسمية» ما لم يمر عبر حل الفوترة الإلكتروني المعتمد للمنشأة.
// عند ربط حل فوترة رسمي لاحقًا، يتغير مصدر حالة الفاتورة لا هذه القاعدة بصمت.

export const INVOICE_POLICY = Object.freeze({
  taxInvoiceIssuanceEnabled: false,
  preliminaryLabel: 'فاتورة مبدئية غير ضريبية',
  preliminaryNotice: 'فاتورة مبدئية غير ضريبية — لم تُصدر عبر نظام الفوترة الإلكترونية المعتمد للمنشأة، ولا تُعد فاتورة ضريبية نظامية.',
  officialInvoiceActionLabel: 'تسجيل الفاتورة الضريبية الصادرة من نظام الفوترة',
  officialInvoiceRequestLabel: 'طلب إصدار فاتورة ضريبية',
});

export function isOfficialTaxInvoiceIssuanceAllowed() {
  return INVOICE_POLICY.taxInvoiceIssuanceEnabled === true;
}
