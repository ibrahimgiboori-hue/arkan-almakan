'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EmployeeForm from '@/components/EmployeeForm';

export default function EditEmployee() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('employees').select('*').eq('id', id).maybeSingle();
      if (error || !data) { setErr('لم يُعثر على هذا الموظف، أو لا تملك صلاحية عرضه.'); return; }
      setRow(data);
    })();
  }, [id]);

  if (err) return <div className="msg err">{err}</div>;
  if (!row) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{row.full_name_ar}</h1>
          <p><span className="mono">{row.employee_no}</span> — {row.job_title || 'بلا مسمى'}</p>
        </div>
      </div>
      <EmployeeForm initial={row} id={id} />
    </>
  );
}
