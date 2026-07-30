'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS, nextRole, ROLE_AR } from '@/lib/requests';

export default function Advances() {
  const [rows, setRows] = useState(null);
  const [inst, setInst] = useState([]);
  const [emps, setEmps] = useState([]);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ employee_id:'', amount:'', installments:1, first_deduction_month:'', reason:'' });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [a, i, e, u] = await Promise.all([
      supabase.from('advances').select('*, employees(full_name_ar, employee_no)')
        .order('created_at', { ascending: false }),
      supabase.from('advance_installments').select('*').order('due_month'),
      supabase.from('employees').select('id, employee_no, full_name_ar, basic_salary')
        .eq('status','active').order('employee_no'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(a.data || []); setInst(i.data || []); setEmps(e.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  const per = form.amount && form.installments
    ? Number(form.amount) / Number(form.installments) : 0;

  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const { error } = await supabase.from('advances').insert({
      employee_id: form.employee_id,
      amount: Number(form.amount),
      installments: Number(form.installments),
      first_deduction_month: form.first_deduction_month || null,
      reason: form.reason,
      status: 'submitted',
    });
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('تم تقديم الطلب — ينتقل إلى الموارد البشرية ثم المحاسب ثم التعميد');
    setForm({ employee_id:'', amount:'', installments:1, first_deduction_month:'', reason:'' });
    setOpen(false); load();
  }

  async function decide(id, decision) {
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('approve_advance', { p_id: id, p_decision: decision });
    if (error) { setErr(error.message); return; }
    setMsg(decision === 'reject' ? 'رُفض الطلب' : 'تم الاعتماد');
    load();
  }

  async function markDeducted(instId) {
    const { error } = await supabase.from('advance_installments')
      .update({ is_deducted: true, deducted_at: new Date().toISOString().slice(0,10) })
      .eq('id', instId);
    if (error) setErr('تعذّر التحديث: ' + error.message); else load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const debt = (empId) => inst
    .filter((x) => !x.is_deducted && rows.find((r) => r.id === x.advance_id
             && r.employee_id === empId && r.status === 'ceo_approved'))
    .reduce((t, x) => t + Number(x.amount), 0);

  const pending = inst.filter((x) => !x.is_deducted &&
    rows.find((r) => r.id === x.advance_id && r.status === 'ceo_approved'));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>السلف والمديونيات</h1>
          <p>طلبات السلف، أقساط السداد، والمديونية القائمة لكل موظف</p>
        </div>
        <button className="btn" onClick={()=>setOpen(!open)}>
          {open ? 'إغلاق النموذج' : 'طلب سلفة جديد'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {open && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>طلب سلفة</h2></header>
          <form onSubmit={submit} style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>الموظف *</label>
                <select required value={form.employee_id}
                        onChange={(e)=>setForm({...form, employee_id:e.target.value})}>
                  <option value="">—</option>
                  {emps.map((x) => <option key={x.id} value={x.id}>{x.employee_no} — {x.full_name_ar}</option>)}
                </select>
                {form.employee_id && (
                  <span className="hint">المديونية القائمة: {money(debt(form.employee_id))} ريال</span>
                )}
              </div>
              <div className="field">
                <label>المبلغ (ريال) *</label>
                <input type="number" min="1" step="0.01" required dir="ltr" value={form.amount}
                       onChange={(e)=>setForm({...form, amount:e.target.value})} />
              </div>
              <div className="field">
                <label>عدد الأقساط *</label>
                <input type="number" min="1" max="24" required dir="ltr" value={form.installments}
                       onChange={(e)=>setForm({...form, installments:e.target.value})} />
              </div>
              <div className="field">
                <label>القسط الشهري</label>
                <input value={per ? per.toFixed(2) : ''} readOnly dir="ltr"
                       style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}} />
                <span className="hint">محسوب — يُجبر الفرق في القسط الأخير</span>
              </div>
              <div className="field">
                <label>شهر بداية الخصم</label>
                <input type="date" dir="ltr" value={form.first_deduction_month}
                       onChange={(e)=>setForm({...form, first_deduction_month:e.target.value})} />
                <span className="hint">الافتراضي: الشهر القادم</span>
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
        <header><h2>الطلبات</h2></header>
        {rows.length === 0 ? (
          <div className="empty"><h3>لا طلبات</h3><p>قدّم أول طلب سلفة من الزر أعلى الصفحة.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الموظف</th><th className="num">المبلغ</th><th className="num">الأقساط</th>
                  <th>الحالة</th><th>الخطوة التالية</th><th>تاريخ الصرف</th><th>إجراء</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nr = nextRole('advance', r.status);
                const mine = nr && role === nr;
                return (
                  <tr key={r.id}>
                    <td>{r.employees?.full_name_ar || '—'}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="num">{r.installments}</td>
                    <td><span className={`pill ${STATUS_CLASS[r.status]}`}>{STATUS_AR[r.status]}</span></td>
                    <td style={{fontSize:13,color:'var(--ink-soft)'}}>{nr ? ROLE_AR[nr] : '—'}</td>
                    <td className="mono">{dateAr(r.disbursed_at)}</td>
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

      <div className="section">
        <header>
          <h2>أقساط قائمة</h2>
          <span style={{fontSize:13,color:'var(--ink-soft)'}}>
            إجمالي غير المخصوم: {money(pending.reduce((t,x)=>t+Number(x.amount),0))} ريال
          </span>
        </header>
        {pending.length === 0 ? (
          <div className="empty"><h3>لا أقساط قائمة</h3><p>كل الأقساط المستحقة خُصمت، أو لا سلف معمَّدة بعد.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الموظف</th><th>شهر الخصم</th><th className="num">القسط</th><th>تسجيل الخصم</th></tr>
            </thead>
            <tbody>
              {pending.map((x) => {
                const adv = rows.find((r) => r.id === x.advance_id);
                return (
                  <tr key={x.id}>
                    <td>{adv?.employees?.full_name_ar || '—'}</td>
                    <td className="mono">{dateAr(x.due_month)}</td>
                    <td className="num">{money(x.amount)}</td>
                    <td>
                      {['ceo','accountant'].includes(role) ? (
                        <button className="btn ghost" style={{padding:'5px 11px',fontSize:13}}
                                onClick={()=>markDeducted(x.id)}>خُصم من الراتب</button>
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
