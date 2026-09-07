import Link from 'next/link';

export default function ContractorsLayout({ children }) {
  return (
    <>
      <nav
        className="rowsplit"
        aria-label="تنقل المقاولين"
        style={{ marginBottom: 14, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}
      >
        <Link className="btn ghost" href="/dashboard/contractors">المقاولون</Link>
        <Link className="btn ghost" href="/dashboard/contractors/timesheets">تايم شيتات المقاولين</Link>
      </nav>
      {children}
    </>
  );
}
