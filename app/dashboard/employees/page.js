'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr, STATUS_AR } from '@/lib/format';

export default function Employees() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('employee_no');
      if (error) setErr('تعذّر تحميل الموظفين. تأكد من صلاحيات حسابك ثم أعد المحاولة.');
      setRows(data || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.full_name_ar, r.full_name_en, r.employee_no, r.job_title, r.mobile]
        .filter(Boolean).some((v) => String(v).includes(t))
    );
  }, [rows, q]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الموظفون</h1>
          <p>{rows.length} موظفاً مسجلاً</p>
        </div>
        <Link className="btn" href="/dashboard/employees/new">إضافة موظف</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:16}}>{err}</div>}

      <div className="section">
        <header>
          <h2>سجل الموظفين</h2>
          <input className="search" placeholder="ابحث بالاسم أو الرقم أو الجوال"
                 value={q} onChange={(e)=>setQ(e.target.value)} />
        </header>

        {filtered.length === 0 ? (
          <div className="empty">
            <h3>لا نتائج</h3>
            <p>لا يوجد موظف مطابق لبحثك. جرّب كلمة أخرى أو أضف موظفاً جديداً.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرقم</th><th>الاسم</th><th>المسمى الوظيفي</th>
                <th>الجوال</th><th className="num">الراتب الإجمالي</th>
                <th>انتهاء الهوية</th><th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const gross = Number(e.basic_salary||0) + Number(e.housing_allowance||0)
                            + Number(e.transport_allowance||0) + Number(e.other_allowance||0);
                return (
                  <tr key={e.id}>
                    <td className="mono">{e.employee_no}</td>
                    <td><Link href={`/dashboard/employees/${e.id}`}>{e.full_name_ar}</Link></td>
                    <td>{e.job_title || '—'}</td>
                    <td className="mono">{e.mobile || '—'}</td>
                    <td className="num">{money(gross)}</td>
                    <td className="mono">{dateAr(e.id_expiry)}</td>
                    <td>
                      <span className={`pill ${e.status === 'active' ? 'ok' : ''}`}>
                        {STATUS_AR[e.status] || e.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
