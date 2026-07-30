'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS, LEAVE_AR, nextRole, ROLE_AR } from '@/lib/requests';

const KINDS = ['annual','sick','unpaid','permission','emergency','hajj','maternity'];

export default function Leaves() {
  const [rows, setRows] = useState(null);
  const [bal, setBal] = useState([]);
  const [emps, setEmps] = useState([]);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ employee_id:'', leave_kind:'annual', start_date:'', end_date:'', reason:'' });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [r, b, e, u] = await Promise.all([
      supabase.from('leave_requests')
        .select('*, employees(full_name_ar, employee_no)')
        .order('created_at', { ascending: false }),
      supabase.from('v_leave_balance').select('*').eq('year', new Date().getFullYear()),
      supabase.from('employees').select('id, employee_no, full_name_ar').eq('status','active').order('employee_no'),
      supabase.from('app_users').select('role').eq('id', (await supabase.auth.getSession()).data.session?.user?.id).maybeSingle(),
    ]);
    setRows(r.data || []); setBal(b.data || []); setEmps(e.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  const days = form.start_date && form.end_date
    ? Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1 : 0;

  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg('');
    if (days <= 0) { setErr('تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له.'); return; }
    const { error } = await supabase.from('leave_requests').insert({
      ...form, status: 'submitted', is_paid: form.leave_kind !== 'unpaid',
    });
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('تم تقديم الطلب — انتقل إلى الموارد البشرية للتدقيق');
    setForm({ employee_id:'', leave_kind:'annual', start_date:'', end_date:'', reason:'' });
    setOpen(false); load();
  }

  async function decide(id, decision) {
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('approve_leave', { p_id: id, p_decision: decision });
    if (error) { setErr(error.message); return; }
    setMsg(decision === 'reject' ? 'رُفض الطلب' : 'تم الاعتماد');
    load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const balOf = (empId) => bal.find((b) => b.employee_id === empId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الإجازات</h1>
          <p>الطلبات والأرصدة ودورة الاعتماد</p>
        </div>
        <button className="btn" onClick={()=>setOpen(!open)}>
          {open ? 'إغلاق النموذج' : 'طلب إجازة جديد'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {open && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>طلب إجازة</h2></header>
          <form onSubmit={submit} style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>الموظف *</label>
                <select required value={form.employee_id}
                        onChange={(e)=>setForm({...form, employee_id:e.target.value})}>
                  <option value="">—</option>
                  {emps.map((x) => <option key={x.id} value={x.id}>{x.employee_no} — {x.full_name_ar}</option>)}
                </select>
                {form.employee_id && balOf(form.employee_id) && (
                  <span className="hint">
                    الرصيد المتبقي: {balOf(form.employee_id).remaining_days} يوم
                  </span>
                )}
              </div>
              <div className="field">
                <label>نوع الإجازة *</label>
                <select value={form.leave_kind} onChange={(e)=>setForm({...form, leave_kind:e.target.value})}>
                  {KINDS.map((k) => <option key={k} value={k}>{LEAVE_AR[k]}</option>)}
                </select>
              </div>
              <div className="field">
                <label>عدد الأيام</label>
                <input value={days || ''} readOnly dir="ltr"
                       style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}} />
                <span className="hint">محسوب من التاريخين</span>
              </div>
              <div className="field">
                <label>من *</label>
                <input type="date" required dir="ltr" value={form.start_date}
                       onChange={(e)=>setForm({...form, start_date:e.target.value})} />
              </div>
              <div className="field">
                <label>إلى *</label>
                <input type="date" required dir="ltr" value={form.end_date}
                       onChange={(e)=>setForm({...form, end_date:e.target.value})} />
              </div>
              <div className="field">
                <label>السبب</label>
                <input value={form.reason} onChange={(e)=>setForm({...form, reason:e.target.value})} />
              </div>
            </div>
            <button className="btn" type="submit">تقديم الطلب</button>
          </form>
        </div>
      )}

      <div className="section">
        <header><h2>أرصدة الإجازة السنوية {new Date().getFullYear()}</h2></header>
        {bal.length === 0 ? (
          <div className="empty"><h3>لا أرصدة</h3><p>ستُنشأ الأرصدة عند إضافة الموظفين.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الموظف</th><th className="num">المستحق</th><th className="num">مرحّل</th>
                  <th className="num">المستنفد</th><th className="num">المتبقي</th></tr>
            </thead>
            <tbody>
              {bal.map((b) => {
                const emp = emps.find((e) => e.id === b.employee_id);
                return (
                  <tr key={b.id}>
                    <td>{emp ? `${emp.employee_no} — ${emp.full_name_ar}` : '—'}</td>
                    <td className="num">{b.entitled_days}</td>
                    <td className="num">{b.carried_over}</td>
                    <td className="num">{b.used_days}</td>
                    <td className="num">
                      <span className={`pill ${Number(b.remaining_days) <= 0 ? 'bad' : 'ok'}`}>
                        {b.remaining_days}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="section">
        <header><h2>الطلبات</h2></header>
        {rows.length === 0 ? (
          <div className="empty">
            <h3>لا طلبات</h3>
            <p>قدّم أول طلب إجازة من الزر أعلى الصفحة.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th>
                  <th className="num">الأيام</th><th>الحالة</th><th>الخطوة التالية</th><th>إجراء</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nr = nextRole('leave', r.status);
                const mine = nr && role === nr;
                return (
                  <tr key={r.id}>
                    <td>{r.employees?.full_name_ar || '—'}</td>
                    <td>{LEAVE_AR[r.leave_kind]}</td>
                    <td className="mono">{dateAr(r.start_date)}</td>
                    <td className="mono">{dateAr(r.end_date)}</td>
                    <td className="num">{r.days_count}</td>
                    <td><span className={`pill ${STATUS_CLASS[r.status]}`}>{STATUS_AR[r.status]}</span></td>
                    <td style={{fontSize:13,color:'var(--ink-soft)'}}>{nr ? ROLE_AR[nr] : '—'}</td>
                    <td>
                      {mine ? (
                        <div className="rowsplit">
                          <button className="btn" style={{padding:'5px 11px',fontSize:13}}
                                  onClick={()=>decide(r.id,'approve')}>اعتماد</button>
                          <button className="btn ghost" style={{padding:'5px 11px',fontSize:13}}
                                  onClick={()=>decide(r.id,'reject')}>رفض</button>
                        </div>
                      ) : '—'}
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
