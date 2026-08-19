'use client';
import GovernedCellGrid from '@/components/print/GovernedCellGrid';

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
      weights:[12,38,10,40],
      cells:[
        {label:true,content:'اسم المستفيد'},
        {content:beneficiary || '—'},
        {label:true,content:'البنك'},
        {content:bank || '—'},
      ],
    },
    {
      key:'account-iban',
      weights:[12,38,10,40],
      cells:[
        {label:true,content:'رقم الحساب'},
        {content:accountNo || '—',className:'bank-value'},
        {label:true,content:'الآيبان'},
        {content:iban || '—',className:'bank-value'},
      ],
    },
    {
      key:'reference',
      weights:[12,88],
      cells:[
        {label:true,content:'مرجع التحويل'},
        {content:reference || '—'},
      ],
    },
  ];

  return <GovernedCellGrid gridKey="projects-finance:payment" rows={rows} className="financial-payment-grid" />;
}
