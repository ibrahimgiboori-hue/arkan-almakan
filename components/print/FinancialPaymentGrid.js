'use client';

export default function FinancialPaymentGrid({
  beneficiary,
  bank,
  accountNo,
  iban,
  reference,
}) {
  return (
    <div className="xlsx-grid financial-payment-grid">
      <div className="xlsx-cell xlsx-label s2">اسم المستفيد</div>
      <div className="xlsx-cell xlsx-value s5">{beneficiary || '—'}</div>
      <div className="xlsx-cell xlsx-label s1">البنك</div>
      <div className="xlsx-cell xlsx-value s4">{bank || '—'}</div>

      <div className="xlsx-cell xlsx-label s2">رقم الحساب</div>
      <div className="xlsx-cell xlsx-value num s4">{accountNo || '—'}</div>
      <div className="xlsx-cell xlsx-label s1">الآيبان</div>
      <div className="xlsx-cell xlsx-value num s5">{iban || '—'}</div>

      <div className="xlsx-cell xlsx-label s2">مرجع التحويل</div>
      <div className="xlsx-cell xlsx-value s10">{reference || '—'}</div>
    </div>
  );
}
