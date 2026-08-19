'use client';
import GovernedCellGrid from '@/components/print/GovernedCellGrid';

function BankCode({ value }) {
  return <span className="bank-code" dir="ltr">{value || '—'}</span>;
}

export default function FinancialPaymentGrid({
  beneficiary,
  bank,
  accountNo,
  iban,
  reference,
}) {
  const rows = [
    {
      key:'beneficiary-bank',
      weights:[6,12,6,24],
      cells:[
        {label:true,content:'اسم المستفيد'},
        {content:beneficiary || '—'},
        {label:true,content:'البنك'},
        {content:bank || '—'},
      ],
    },
    {
      key:'account-iban',
      weights:[6,12,6,24],
      cells:[
        {label:true,content:'رقم الحساب'},
        {content:<BankCode value={accountNo} />,className:'bank-value',dir:'rtl'},
        {label:true,content:'الآيبان'},
        {content:<BankCode value={iban} />,className:'bank-value',dir:'rtl'},
      ],
    },
    {
      key:'reference',
      weights:[12.5,87.5],
      cells:[
        {label:true,content:'مرجع التحويل'},
        {content:reference || '—'},
      ],
    },
  ];

  return <GovernedCellGrid gridKey="projects-finance:payment:aligned-v1" rows={rows} className="financial-payment-grid" />;
}
