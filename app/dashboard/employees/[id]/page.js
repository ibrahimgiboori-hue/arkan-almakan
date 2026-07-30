'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import EmployeeForm from '@/components/EmployeeForm';
import EmpContracts from '@/components/EmpContracts';
import EmpDocuments from '@/components/EmpDocuments';
import EmpDiscipline from '@/components/EmpDiscipline';
import { money, dateAr, STATUS_AR } from '@/lib/format';

const TABS = [
  { k:'data',       label:'البيانات' },
  { k:'contracts',  label:'العقود' },
  { k:'documents',  label:'المستندات' },
  { k:'discipline', label:'الجزاءات' },
];

export default function EmployeePage() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [tab, setTab] = useState('data');
  const [bal, setBal] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('employees').select('*').eq('id', id).maybeSingle();
      if (error || !data) { setErr('لم يُعثر على هذا الموظف، أو لا تملك صلاحية عرضه.'); return; }
      setRow(data);
      const { data: b } = await supabase.from('v_leave_balance')
        .select('*').eq('employee_id', id).eq('year', new Date().getFullYear()).maybeSingle();
      setBal(b);
    })();
  }, [id]);

  if (err) return <div className="msg err">{err}</div>;
  if (!row) return <div className="empty">جارٍ التحميل…</div>;

  const gross = Number(row.basic_salary||0)+Number(row.housing_allowance||0)
              + Number(row.transport_allowance||0)+Number(row.other_allowance||0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{row.full_name_ar}</h1>
          <p>
            <span className="mono">{row.employee_no}</span> — {row.job_title || 'بلا مسمى'}
            {row.hire_date ? ` — التعيين ${dateAr(row.hire_date)}` : ''}
          </p>
        </div>
        <Link className="btn ghost" href="/dashboard/employees">كل الموظفين</Link>
      </div>

      <div className="grid k4" style={{marginBottom:20}}>
        <div className="card">
          <h3>الراتب الإجمالي</h3>
          <div className="big">{money(gross)}</div>
          <div className="foot">ريال شهرياً</div>
        </div>
        <div className="card">
          <h3>رصيد الإجازة</h3>
          <div className="big">{bal ? bal.remaining_days : '—'}</div>
          <div className="foot">{bal ? `من ${bal.entitled_days} يوماً` : 'لم يُنشأ رصيد بعد'}</div>
        </div>
        <div className="card">
          <h3>الحالة</h3>
          <div className="big" style={{fontSize:20,paddingTop:8}}>{STATUS_AR[row.status] || row.status}</div>
          <div className="foot">{row.nationality || '—'}</div>
        </div>
        <div className="card">
          <h3>نسبة العمولة</h3>
          <div className="big">{(Number(row.commission_rate||0)*100).toFixed(1)}%</div>
          <div className="foot">من ربح المشاريع التي يجلبها</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.k} className={tab === t.k ? 'on' : ''} onClick={()=>setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'data'       && <EmployeeForm initial={row} id={id} />}
      {tab === 'contracts'  && <EmpContracts employeeId={id} employee={row} />}
      {tab === 'documents'  && <EmpDocuments employeeId={id} />}
      {tab === 'discipline' && <EmpDiscipline employeeId={id} />}
    </>
  );
}
