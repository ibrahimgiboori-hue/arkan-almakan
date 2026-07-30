'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr, daysUntil, STATUS_AR } from '@/lib/format';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [expiring, setExpiring] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, employee_no, full_name_ar, job_title, status, id_expiry, basic_salary, housing_allowance, transport_allowance, other_allowance')
        .order('employee_no');

      const list = emps || [];
      const active = list.filter((e) => e.status === 'active');
      const payroll = active.reduce((t, e) =>
        t + Number(e.basic_salary||0) + Number(e.housing_allowance||0)
          + Number(e.transport_allowance||0) + Number(e.other_allowance||0), 0);

      const soon = list
        .filter((e) => e.id_expiry && daysUntil(e.id_expiry) !== null && daysUntil(e.id_expiry) <= 90)
        .sort((a,b) => new Date(a.id_expiry) - new Date(b.id_expiry));

      const { count: docCount } = await supabase
        .from('documents').select('id', { count: 'exact', head: true });

      setS({ total: list.length, active: active.length, payroll, docCount: docCount || 0 });
      setExpiring(soon);
    })();
  }, []);

  if (!s) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>لوحة المتابعة</h1>
          <p>ملخص حالة الشركة اليوم</p>
        </div>
        <Link className="btn" href="/dashboard/employees/new">إضافة موظف</Link>
      </div>

      <div className="grid k4">
        <div className="card">
          <h3>الموظفون</h3>
          <div className="big">{s.total}</div>
          <div className="foot">{s.active} على رأس العمل</div>
        </div>
        <div className="card">
          <h3>الرواتب الشهرية</h3>
          <div className="big">{money(s.payroll)}</div>
          <div className="foot">ريال — إجمالي الأساسي والبدلات</div>
        </div>
        <div className="card">
          <h3>هويات تنتهي قريباً</h3>
          <div className="big">{expiring.length}</div>
          <div className="foot">خلال ٩٠ يوماً</div>
        </div>
        <div className="card">
          <h3>المستندات الصادرة</h3>
          <div className="big">{s.docCount}</div>
          <div className="foot">من محرك النماذج</div>
        </div>
      </div>

      <div className="section">
        <header>
          <h2>تنبيهات انتهاء الهويات والإقامات</h2>
          <Link className="btn ghost" href="/dashboard/employees">كل الموظفين</Link>
        </header>
        {expiring.length === 0 ? (
          <div className="empty">
            <h3>لا تنبيهات</h3>
            <p>لا توجد هوية أو إقامة تنتهي خلال التسعين يوماً القادمة.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الرقم</th><th>الاسم</th><th>المسمى</th>
                <th>تاريخ الانتهاء</th><th>المتبقي</th><th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((e) => {
                const d = daysUntil(e.id_expiry);
                const cls = d < 0 ? 'bad' : d <= 30 ? 'bad' : d <= 60 ? 'warn' : '';
                return (
                  <tr key={e.id}>
                    <td className="mono">{e.employee_no}</td>
                    <td><Link href={`/dashboard/employees/${e.id}`}>{e.full_name_ar}</Link></td>
                    <td>{e.job_title || '—'}</td>
                    <td className="mono">{dateAr(e.id_expiry)}</td>
                    <td>
                      <span className={`pill ${cls}`}>
                        {d < 0 ? `منتهية منذ ${Math.abs(d)} يوم` : `${d} يوم`}
                      </span>
                    </td>
                    <td>{STATUS_AR[e.status] || e.status}</td>
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
