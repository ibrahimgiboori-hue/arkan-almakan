'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS, LEAVE_AR, nextStage, STAGE_AR } from '@/lib/requests';
import ManualDecisionForm from '@/components/ManualDecisionForm';

const KINDS = ['annual','sick','unpaid','permission','emergency','hajj','maternity'];
const EMPTY = { employee_id:'', leave_kind:'annual', start_date:'', end_date:'', reason:'' };

export default function Leaves() {
  const [rows, setRows] = useState(null);
  const [bal, setBal] = useState([]);
  const [emps, setEmps] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [r, b, e] = await Promise.all([
      supabase.from('leave_requests')
        .select('*, employees(full_name_ar, employee_no)')
        .order('created_at', { ascending: false }),
      supabase.from('v_leave_balance').select('*').eq('year', new Date().getFullYear()),
      supabase.from('employees')
        .select('id, employee_no, full_name_ar, person_kind, board_role, job_title')
        .eq('status','active')
        .order('employee_no'),
    ]);
    setRows(r.data || []);
    setBal(b.data || []);
    setEmps(e.data || []);
  }

  useEffect(() => { load(); }, []);

  const days = form.start_date && form.end_date
    ? Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1 : 0;

  function startEdit(r) {
    setDecisionTarget(null);
    setEditId(r.id);
    setForm({
      employee_id: r.employee_id,
      leave_kind: r.leave_kind,
      start_date: r.start_date,
      end_date: r.end_date,
      reason: r.reason || '',
    });
    setOpen(true);
    setErr('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    setDecisionTarget(null);
    setEditId(null);
    setForm({ ...EMPTY });
    setOpen(true);
    setErr('');
    setMsg('');
  }

  function startDecision(r) {
    setOpen(false);
    setEditId(null);
    setDecisionTarget(r);
    setErr('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (days <= 0) {
      setErr('تاريخ النهاية يجب أن يكون بعد البداية أو مساوياً لها.');
      return;
    }

    const payload = { ...form, is_paid: form.leave_kind !== 'unpaid' };

    const res = editId
      ? await supabase.from('leave_requests').update(payload).eq('id', editId)
      : await supabase.from('leave_requests').insert({ ...payload, status: 'submitted' });

    if (res.error) {
      setErr('تعذّر الحفظ: ' + res.error.message);
      return;
    }

    setMsg(editId ? 'حفظت التعديلات' : 'تم تسجيل طلب الإجازة');
    setForm({ ...EMPTY });
    setEditId(null);
    setOpen(false);
    load();
  }

  async function submitDecision({ actorEmployeeId, decision, decisionDate, comment }) {
    if (!decisionTarget) return;
    setDecisionBusy(true);
    setErr('');
    setMsg('');

    const { error } = await supabase.rpc('record_leave_manual_decision', {
      p_id: decisionTarget.id,
      p_actor_employee_id: actorEmployeeId,
      p_decision: decision,
      p_decision_date: decisionDate,
      p_comment: comment,
      p_evidence_path: null,
    });

    setDecisionBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }

    setMsg(decision === 'rejected' ? 'تم تسجيل رفض الطلب' : 'تم تسجيل القرار واعتماد المرحلة');
    setDecisionTarget(null);
    load();
  }

  async function cancel(r) {
    const reason = window.prompt(`سبب إلغاء إجازة ${r.employees?.full_name_ar || ''}:`);
    if (reason === null) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.rpc('cancel_leave', { p_id: r.id, p_reason: reason });
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg('ألغي الطلب وأعيد الرصيد إن كان مخصومًا');
    load();
  }

  async function remove(r) {
    if (!window.confirm('حذف هذا الطلب نهائيًا؟ لا يمكن التراجع.')) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.from('leave_requests').delete().eq('id', r.id);
    if (error) {
      setErr('تعذّر الحذف: ' + error.message);
      return;
    }
    setMsg('حذف الطلب');
    load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const balOf = (id) => bal.find((b) => b.employee_id === id);
  const canEdit = (r) => ['draft','submitted'].includes(r.status);
  const canCancel = (r) => !['cancelled','rejected'].includes(r.status);
  const decisionStage = decisionTarget ? nextStage('leave', decisionTarget.status) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الإجازات</h1>
          <p>الطلبات والأرصدة وتوثيق الاعتمادات الفعلية</p>
        </div>
        <button
          className="btn"
          onClick={open ? () => { setOpen(false); setEditId(null); } : startNew}
        >
          {open ? 'إغلاق النموذج' : 'طلب إجازة جديد'}
        </button>
      </div>

      <div style={{
        marginBottom: 16,
        padding: '11px 13px',
        border: '1px solid var(--line)',
        borderRadius: 8,
        color: 'var(--ink-soft)',
        fontSize: 13,
        lineHeight: 1.8,
      }}>
        تعمل هذه الصفحة حاليًا بنظام التسجيل المركزي. مستخدم البرنامج يسجل الطلب والقرار نيابة عن أصحاب العلاقة، بينما يحفظ النظام صاحب القرار الفعلي بصورة مستقلة.
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {decisionTarget && decisionStage && (
        <ManualDecisionForm
          requestLabel={`إجازة ${decisionTarget.employees?.full_name_ar || ''}`}
          stageLabel={STAGE_AR[decisionStage]}
          employees={emps}
          busy={decisionBusy}
          onSubmit={submitDecision}
          onClose={() => setDecisionTarget(null)}
        />
      )}

      {open && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل طلب إجازة' : 'طلب إجازة'}</h2></header>
          <form onSubmit={submit} style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>الموظف *</label>
                <select
                  required
                  value={form.employee_id}
                  onChange={(e)=>setForm({...form, employee_id:e.target.value})}
                >
                  <option value="">اختر الموظف</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.employee_no} - {x.full_name_ar}</option>)}
                </select>
                {form.employee_id && balOf(form.employee_id) && (
                  <span className="hint">الرصيد المتبقي: {balOf(form.employee_id).remaining_days} يوم</span>
                )}
              </div>
              <div className="field">
                <label>نوع الإجازة *</label>
                <select value={form.leave_kind} onChange={(e)=>setForm({...form, leave_kind:e.target.value})}>
                  {KINDS.map((k)=><option key={k} value={k}>{LEAVE_AR[k]}</option>)}
                </select>
              </div>
              <div className="field">
                <label>عدد الأيام</label>
                <input
                  value={days || ''}
                  readOnly
                  dir="ltr"
                  style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}}
                />
              </div>
              <div className="field">
                <label>من *</label>
                <input
                  type="date"
                  required
                  dir="ltr"
                  value={form.start_date}
                  onChange={(e)=>setForm({...form, start_date:e.target.value})}
                />
              </div>
              <div className="field">
                <label>إلى *</label>
                <input
                  type="date"
                  required
                  dir="ltr"
                  value={form.end_date}
                  onChange={(e)=>setForm({...form, end_date:e.target.value})}
                />
              </div>
              <div className="field">
                <label>السبب</label>
                <input value={form.reason} onChange={(e)=>setForm({...form, reason:e.target.value})} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ التعديلات' : 'تسجيل الطلب'}</button>
              <button
                className="btn ghost"
                type="button"
                onClick={()=>{setOpen(false);setEditId(null);setForm({...EMPTY});}}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="section">
        <header><h2>أرصدة الإجازة السنوية {new Date().getFullYear()}</h2></header>
        {bal.length === 0 ? (
          <div className="empty"><h3>لا أرصدة</h3><p>تنشأ عند تسجيل الاعتماد النهائي لأول إجازة سنوية.</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الموظف</th><th className="num">المستحق</th><th className="num">مرحّل</th>
                <th className="num">المستنفد</th><th className="num">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {bal.map((b) => {
                const emp = emps.find((e) => e.id === b.employee_id);
                return (
                  <tr key={b.id}>
                    <td>{emp ? `${emp.employee_no} - ${emp.full_name_ar}` : 'غير محدد'}</td>
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
          <div className="empty"><h3>لا طلبات</h3><p>سجل أول طلب من الزر أعلى الصفحة.</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th>
                <th className="num">الأيام</th><th>الحالة</th><th>المرحلة التالية</th>
                <th style={{width:230}}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stage = nextStage('leave', r.status);
                return (
                  <tr key={r.id}>
                    <td>{r.employees?.full_name_ar || 'غير محدد'}</td>
                    <td>{LEAVE_AR[r.leave_kind]}</td>
                    <td className="mono">{dateAr(r.start_date)}</td>
                    <td className="mono">{dateAr(r.end_date)}</td>
                    <td className="num">{r.days_count}</td>
                    <td>
                      <span className={`pill ${STATUS_CLASS[r.status]}`}>{STATUS_AR[r.status]}</span>
                      {r.cancel_reason && (
                        <div style={{fontSize:11.5,color:'var(--ink-soft)',marginTop:3}}>{r.cancel_reason}</div>
                      )}
                    </td>
                    <td style={{fontSize:13,color:'var(--ink-soft)'}}>
                      {stage ? STAGE_AR[stage] : 'مكتملة'}
                    </td>
                    <td>
                      <div className="rowsplit">
                        {stage && !['cancelled','rejected'].includes(r.status) && (
                          <button
                            className="btn"
                            style={{padding:'4px 9px',fontSize:12.5}}
                            onClick={()=>startDecision(r)}
                          >
                            تسجيل القرار
                          </button>
                        )}
                        {canEdit(r) && (
                          <button
                            className="btn ghost"
                            style={{padding:'4px 9px',fontSize:12.5}}
                            onClick={()=>startEdit(r)}
                          >
                            تعديل
                          </button>
                        )}
                        {canCancel(r) && (
                          <button
                            className="btn ghost"
                            style={{padding:'4px 9px',fontSize:12.5}}
                            onClick={()=>cancel(r)}
                          >
                            إلغاء
                          </button>
                        )}
                        {canEdit(r) && (
                          <button
                            className="btn ghost"
                            style={{padding:'4px 9px',fontSize:12.5,borderColor:'#EBC3C0',color:'#A32B24'}}
                            onClick={()=>remove(r)}
                          >
                            حذف
                          </button>
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
