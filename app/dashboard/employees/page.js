'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr, STATUS_AR } from '@/lib/format';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  Toolbar,
  TableFrame,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

export default function Employees() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setErr('');
    setRows(null);
    try {
      const { data:sessionData, error:sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const activation = await supabase.rpc('activate_due_temporary_replacements');
      if (activation.error && activation.error.code !== 'PGRST202') {
        console.warn('[employees] temporary replacement activation failed', activation.error);
      }
      const userId = sessionData.session?.user?.id;
      const employeesQuery = supabase.from('employees').select('*').eq('person_kind', 'employee');
      const roleQuery = userId
        ? supabase.from('app_users').select('role').eq('id', userId).maybeSingle()
        : Promise.resolve({ data:null, error:null });
      const [employeesResult, userResult] = await Promise.all([employeesQuery, roleQuery]);
      if (employeesResult.error) throw employeesResult.error;
      if (userResult.error) throw userResult.error;
      setRows(employeesResult.data || []);
      setRole(userResult.data?.role || null);
    } catch (error) {
      console.error('[employees] load failed', error);
      setRows([]);
      setRole(null);
      setErr(`تعذّر تحميل الموظفين: ${error?.message || 'حدث خطأ غير متوقع'}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(r, status) {
    setErr(''); setMsg('');
    const { error } = await supabase.from('employees').update({ status }).eq('id', r.id);
    if (error) { setErr('تعذّر التحديث: ' + error.message); return; }
    setMsg('حُدّثت الحالة'); load();
  }

  async function remove(r) {
    if (!window.confirm(`حذف ${r.full_name_ar}؟\nإن كان له رواتب أو مستندات صادرة فسيُعطَّل بدل حذفه.`)) return;
    setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('delete_employee_safe', { p_emp: r.id });
    if (error) { setErr(error.message); return; }
    setMsg(data); load();
  }

  const orderKey = (no) => {
    const s = String(no || '');
    if (/^EMP-\d{2}$/.test(s)) return [1, Number(s.slice(4))];
    if (/^EMP-\d{3}$/.test(s)) return [2, Number(s.slice(4))];
    return [3, 999999];
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r) => showInactive || r.status !== 'terminated')
      .filter((r) => !t || [r.full_name_ar, r.full_name_en, r.employee_no, r.job_title, r.mobile]
        .filter(Boolean).some((v) => String(v).includes(t)))
      .sort((a,b)=>{ const A=orderKey(a.employee_no),B=orderKey(b.employee_no); return A[0]-B[0] || A[1]-B[1]; });
  }, [rows, q, showInactive]);

  if (!rows) return <ConstitutionPage><EmptyState title="جارٍ تحميل سجل الموظفين…" /></ConstitutionPage>;

  const canWrite = ['ceo','hr'].includes(role);
  const activeCount = rows.filter((r)=>r.status==='active').length;
  const pendingCount = rows.filter((r)=>r.status==='pending_start').length;

  const headerActions = (
    <Toolbar>
      <Link className="btn ghost" href="/dashboard/board">مجلس الإدارة</Link>
      <Link className="btn ghost" href="/print/employees" target="_blank">تقرير الموظفين</Link>
      <Link className="btn" href="/dashboard/employees/new">إضافة موظف</Link>
    </Toolbar>
  );

  const registryActions = (
    <Toolbar>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,cursor:'pointer'}}>
        <input type="checkbox" checked={showInactive} onChange={(e)=>setShowInactive(e.target.checked)} />
        إظهار المنتهية خدمتهم
      </label>
      <input className="search" placeholder="ابحث بالاسم أو الرقم أو الجوال" value={q} onChange={(e)=>setQ(e.target.value)} />
    </Toolbar>
  );

  return (
    <ConstitutionPage>
      <PageHeader
        eyebrow="WORKFORCE"
        title="الموظفون"
        description={`${activeCount} على رأس العمل${pendingCount ? ` · ${pendingCount} بانتظار المباشرة` : ''} · ${rows.length} مسجلاً`}
        actions={headerActions}
      />

      {err && <Notice tone="error" actions={<button className="btn ghost" type="button" onClick={load}>إعادة المحاولة</button>}>{err}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}

      <Section title="سجل الموظفين" description="قائمة موحدة للبيانات الوظيفية والحالة الحالية" actions={registryActions}>
        {filtered.length === 0 ? <EmptyState title="لا توجد نتائج مطابقة" /> : (
          <TableFrame>
            <table>
              <thead><tr><th>الرقم</th><th>الاسم</th><th>المسمى</th><th>الجوال</th><th className="num">الراتب الإجمالي</th><th>انتهاء الهوية</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
              <tbody>{filtered.map((e)=>{
                const gross=Number(e.basic_salary||0)+Number(e.housing_allowance||0)+Number(e.transport_allowance||0)+Number(e.other_allowance||0);
                const pending=e.status==='pending_start';
                return <tr key={e.id} style={e.status==='terminated'?{opacity:.55}:undefined}>
                  <td className="mono">{e.employee_no}</td>
                  <td><Link href={`/dashboard/employees/${e.id}`}>{e.full_name_ar}</Link>{e.employment_kind==='temporary_replacement' && <div style={{fontSize:10,color:'var(--ui-muted)'}}>بديل مؤقت</div>}</td>
                  <td>{e.job_title||'—'}</td>
                  <td className="mono">{e.mobile||'—'}</td>
                  <td className="num">{money(gross)}</td>
                  <td className="mono">{dateAr(e.id_expiry)}</td>
                  <td>{canWrite && !pending ? (
                    <select value={e.status} onChange={(ev)=>setStatus(e,ev.target.value)}>
                      <option value="active">على رأس العمل</option><option value="on_leave">في إجازة</option><option value="suspended">موقوف</option><option value="terminated">منتهي</option>
                    </select>
                  ) : <span className={`pill ${e.status==='active'?'ok':pending?'warn':''}`}>{STATUS_AR[e.status]||e.status}</span>}</td>
                  <td><Toolbar><Link className="btn ghost" href={`/dashboard/employees/${e.id}`}>الملف</Link>{canWrite && <button className="btn ghost" style={{borderColor:'#EBC3C0',color:'#A32B24'}} onClick={()=>remove(e)}>حذف</button>}</Toolbar></td>
                </tr>;
              })}</tbody>
            </table>
          </TableFrame>
        )}
      </Section>
    </ConstitutionPage>
  );
}
