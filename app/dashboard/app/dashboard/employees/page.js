'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr, STATUS_AR } from '@/lib/format';

export default function Employees() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [e, u] = await Promise.all([
      supabase.from('employees').select('*').order('employee_no'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(e.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

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

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r) => showInactive || r.status !== 'terminated')
      .filter((r) => !t || [r.full_name_ar, r.full_name_en, r.employee_no, r.job_title, r.mobile]
        .filter(Boolean).some((v) => String(v).includes(t)));
  }, [rows, q, showInactive]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr'].includes(role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الموظفون</h1>
          <p>{rows.filter((r)=>r.status!=='terminated').length} على رأس العمل من {rows.length} مسجَّلاً</p>
        </div>
        <Link className="btn" href="/dashboard/employees/new">إضافة موظف</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header>
          <h2>سجل الموظفين</h2>
          <div className="rowsplit">
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer'}}>
              <input type="checkbox" checked={showInactive}
                     onChange={(e)=>setShowInactive(e.target.checked)} />
              إظهار المنتهية خدمتهم
            </label>
            <input className="search" placeholder="ابحث بالاسم أو الرقم أو الجوال"
                   value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
        </header>

        {filtered.length === 0 ? (
          <div className="empty"><h3>لا نتائج</h3><p>جرّب كلمة أخرى أو أضف موظفاً جديداً.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الرقم</th><th>الاسم</th><th>المسمى</th><th>الجوال</th>
                  <th className="num">الراتب الإجمالي</th><th>انتهاء الهوية</th>
                  <th>الحالة</th><th style={{width:180}}>الإجراءات</th></tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const gross = Number(e.basic_salary||0)+Number(e.housing_allowance||0)
                            + Number(e.transport_allowance||0)+Number(e.other_allowance||0);
                return (
                  <tr key={e.id} style={e.status === 'terminated' ? {opacity:.55} : undefined}>
                    <td className="mono">{e.employee_no}</td>
                    <td><Link href={`/dashboard/employees/${e.id}`}>{e.full_name_ar}</Link></td>
                    <td>{e.job_title || '—'}</td>
                    <td className="mono">{e.mobile || '—'}</td>
                    <td className="num">{money(gross)}</td>
                    <td className="mono">{dateAr(e.id_expiry)}</td>
                    <td>
                      {canWrite ? (
                        <select value={e.status} onChange={(ev)=>setStatus(e, ev.target.value)}
                                style={{fontSize:12.5,padding:'2px 4px'}}>
                          <option value="active">على رأس العمل</option>
                          <option value="on_leave">في إجازة</option>
                          <option value="suspended">موقوف</option>
                          <option value="terminated">منتهي</option>
                        </select>
                      ) : (
                        <span className={`pill ${e.status === 'active' ? 'ok' : ''}`}>
                          {STATUS_AR[e.status]}</span>
                      )}
                    </td>
                    <td>
                      <div className="rowsplit">
                        <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                              href={`/dashboard/employees/${e.id}`}>الملف</Link>
                        {canWrite && (
                          <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                          borderColor:'#EBC3C0',color:'#A32B24'}}
                                  onClick={()=>remove(e)}>حذف</button>
                        )}
                      </div>
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
