'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { money, dateAr, STATUS_AR } from '@/lib/format';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  SummaryStrip,
  FilterSurface,
  Notice,
  Toolbar,
  TableFrame,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

export default function Employees() {
  const me = useDashboardSession();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const readEmployees = useCallback(async () => {
    const result = await supabase.from('employees').select('*').eq('person_kind', 'employee');
    if (result.error) throw result.error;
    return result.data || [];
  }, []);

  const load = useCallback(async () => {
    setErr('');
    if (rows === null) setRows(null);
    try {
      const list = await readEmployees();
      setRows(list);

      // صيانة تشغيلية غير حاجبة: لا نؤخر عرض سجل الموظفين بسبب تحديث البدلاء المؤقتين.
      supabase.rpc('activate_due_temporary_replacements').then(async ({ error }) => {
        if (error) {
          if (error.code !== 'PGRST202') console.warn('[employees] temporary replacement activation failed', error);
          return;
        }
        try {
          const refreshed = await readEmployees();
          setRows(refreshed);
        } catch (refreshError) {
          console.warn('[employees] background refresh failed', refreshError);
        }
      });
    } catch (error) {
      console.error('[employees] load failed', error);
      setRows([]);
      setErr(`تعذّر تحميل الموظفين: ${error?.message || 'حدث خطأ غير متوقع'}`);
    }
  }, [readEmployees, rows]);

  useEffect(() => { load(); }, []);

  const canEdit = Boolean(me?.access?.fullAdmin) || me?.capabilityKeys?.has('hr.employees.edit');
  const canDelete = Boolean(me?.access?.fullAdmin) || me?.capabilityKeys?.has('hr.employees.delete') || me?.capabilityKeys?.has('hr.employees.edit');
  const canCreate = Boolean(me?.access?.fullAdmin) || me?.capabilityKeys?.has('hr.employees.create');

  async function setStatus(row, status) {
    setErr(''); setMsg('');
    const { error } = await supabase.from('employees').update({ status }).eq('id', row.id);
    if (error) { setErr('تعذّر التحديث: ' + error.message); return; }
    setMsg('حُدّثت الحالة'); load();
  }

  async function remove(row) {
    if (!window.confirm(`حذف ${row.full_name_ar}؟\nإن كان له رواتب أو مستندات صادرة فسيُعطَّل بدل حذفه.`)) return;
    setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('delete_employee_safe', { p_emp: row.id });
    if (error) { setErr(error.message); return; }
    setMsg(data); load();
  }

  const orderKey = (no) => {
    const text = String(no || '');
    if (/^EMP-\d{2}$/.test(text)) return [1, Number(text.slice(4))];
    if (/^EMP-\d{3}$/.test(text)) return [2, Number(text.slice(4))];
    return [3, 999999];
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim();
    return rows
      .filter((row) => showInactive || row.status !== 'terminated')
      .filter((row) => !term || [row.full_name_ar, row.full_name_en, row.employee_no, row.job_title, row.mobile].filter(Boolean).some((value) => String(value).includes(term)))
      .sort((a,b)=>{ const A=orderKey(a.employee_no),B=orderKey(b.employee_no); return A[0]-B[0] || A[1]-B[1]; });
  }, [rows, q, showInactive]);

  if (!rows) return <ConstitutionPage><EmptyState title="جارٍ تحميل سجل الموظفين…" /></ConstitutionPage>;

  const activeCount = rows.filter((row)=>row.status==='active').length;
  const leaveCount = rows.filter((row)=>row.status==='on_leave').length;
  const pendingCount = rows.filter((row)=>row.status==='pending_start').length;
  const terminatedCount = rows.filter((row)=>row.status==='terminated').length;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="الموارد البشرية"
      title="الموظفون"
      description="السجل الوظيفي الموحد للموظفين وحالاتهم الحالية."
      actions={<Toolbar>
        <Link className="btn ghost" href="/print/employees" target="_blank">تقرير الموظفين</Link>
        {canCreate?<Link className="btn" href="/dashboard/employees/new">+ إضافة موظف</Link>:null}
      </Toolbar>}
    />

    <Section title="ملخص الموظفين">
      <SummaryStrip items={[
        {key:'active',value:activeCount,label:'على رأس العمل'},
        {key:'leave',value:leaveCount,label:'في إجازة'},
        {key:'pending',value:pendingCount,label:'بانتظار المباشرة'},
        {key:'ended',value:terminatedCount,label:'منتهية خدمتهم'},
      ]}/>
    </Section>

    <Section title="البحث والتصفية">
      <FilterSurface>
        <div className="field"><label>البحث</label><input placeholder="الاسم، الرقم الوظيفي، المسمى أو الجوال" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
        <label style={{display:'flex',alignItems:'center',gap:8,minHeight:44,cursor:'pointer'}}><input type="checkbox" checked={showInactive} onChange={(e)=>setShowInactive(e.target.checked)} /> إظهار المنتهية خدمتهم</label>
        <span>{filtered.length} من {rows.length}</span>
      </FilterSurface>
    </Section>

    {err && <Notice tone="error" actions={<button className="btn ghost" type="button" onClick={load}>إعادة المحاولة</button>}>{err}</Notice>}
    {msg && <Notice tone="success">{msg}</Notice>}

    <Section title="سجل الموظفين" description={`${filtered.length} موظف مطابق للعرض الحالي`}>
      {filtered.length === 0 ? <EmptyState title="لا توجد نتائج مطابقة" /> : <TableFrame>
        <table>
          <thead><tr><th>الرقم</th><th>الاسم</th><th>المسمى</th><th>الجوال</th><th className="num">الراتب الإجمالي</th><th>انتهاء الهوية</th><th>الحالة</th><th>الإجراء</th></tr></thead>
          <tbody>{filtered.map((employee)=>{
            const gross=Number(employee.basic_salary||0)+Number(employee.housing_allowance||0)+Number(employee.transport_allowance||0)+Number(employee.other_allowance||0);
            const pending=employee.status==='pending_start';
            return <tr key={employee.id} style={employee.status==='terminated'?{opacity:.55}:undefined}>
              <td className="mono">{employee.employee_no}</td>
              <td><strong>{employee.full_name_ar}</strong>{employee.employment_kind==='temporary_replacement'&&<div className="hint">بديل مؤقت</div>}</td>
              <td>{employee.job_title||'—'}</td>
              <td className="mono">{employee.mobile||'—'}</td>
              <td className="num">{money(gross)}</td>
              <td className="mono">{dateAr(employee.id_expiry)}</td>
              <td>{canEdit&&!pending?<select value={employee.status} onChange={(event)=>setStatus(employee,event.target.value)}><option value="active">على رأس العمل</option><option value="on_leave">في إجازة</option><option value="suspended">موقوف</option><option value="terminated">منتهي</option></select>:<span className={`pill ${employee.status==='active'?'ok':pending?'warn':''}`}>{STATUS_AR[employee.status]||employee.status}</span>}</td>
              <td><Toolbar><Link className="btn ghost" href={`/dashboard/employees/${employee.id}`}>فتح الملف</Link>{canDelete&&<button className="btn ghost" onClick={()=>remove(employee)}>حذف</button>}</Toolbar></td>
            </tr>;
          })}</tbody>
        </table>
      </TableFrame>}
    </Section>
  </ConstitutionPage>;
}
