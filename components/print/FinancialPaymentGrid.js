'use client';

export default function FinancialPaymentGrid({
  beneficiary,
  bank,
  accountNo,
  iban,
  reference,
}) {
  return (
    <table className="payment-table">
      <tbody>
        <tr>
          <th>اسم المستفيد</th>
          <td>{beneficiary || '—'}</td>
          <th>البنك</th>
          <td>{bank || '—'}</td>
        </tr>
        <tr>
          <th>رقم الحساب</th>
          <td className="bank-value">{accountNo || '—'}</td>
          <th>الآيبان</th>
          <td className="bank-value">{iban || '—'}</td>
        </tr>
        <tr>
          <th>مرجع التحويل</th>
          <td colSpan="3">{reference || '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}
