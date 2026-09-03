'use client';

import Link from 'next/link';
import { dateAr, money } from '@/lib/format';

export default function CurrentQuoteWorkTable({ rows, totalsById, renderActions }) {
  return <table data-current-quotation-work-table="true">
    <thead><tr><th>العرض</th><th>العميل</th><th>النوع</th><th>التاريخ</th><th className="num">القيمة</th><th>الإجراء</th></tr></thead>
    <tbody>{rows.map((row)=><tr key={row.id} data-record-row="true">
      <td className="mono"><Link href={`/dashboard/quotes/${row.id}`}>{row.quote_no}</Link></td>
      <td>{row.client_name || 'عميل غير محدد'}</td>
      <td>{row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
      <td className="mono">{dateAr(row.quote_date)}</td>
      <td className="num">{money(totalsById[row.id]?.grand_total || 0)}</td>
      <td>{renderActions(row)}</td>
    </tr>)}</tbody>
  </table>;
}
