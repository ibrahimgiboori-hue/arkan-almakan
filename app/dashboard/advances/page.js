'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS, nextStage, STAGE_AR } from '@/lib/requests';
import ManualDecisionForm from '@/components/ManualDecisionForm';

const EMPTY = { employee_id:'', amount:'', installments:1, first_deduction_month:'', reason:'' };

function todayLocal() {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

export default function Advances() {
  const [rows, setRows] = useState(null);
  const [inst, setInst] = useState([]);
  const [emps, setEmps] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [disbursementTarget, setDisbursementTarget] = useState(null);
  const [disbursementDate, setDisbursementDate] = useState(todayLocal());
  const [disbursementRef, setDisbursementRef] = useState('');
  const [disbursementBusy, setDisbursementBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [a, i, e] = await Promise.all([
      supabase.from('advances').select('*, employees(full_name_ar, employee_no)')
        .order('created_at', { ascending: false }),
      supabase.from('advance_installments').select('*').order('due_month'),
      supabase.from('employees')
        .select('id, employee_no, full_name_ar, basic_salary, person_kind, board_role, job_title')
        .eq('status','active')
        .order('employee_no'),
    ]);
    setRows(a.data || []);
    setInst(i.data || []);
    setEmps(e.data || []);
  }

  useEffect(() => { load(); }, []);

  const per = form.amount && form.installments
    ? Number(form.amount) / Number(form.installments) : 0;

  function startEdit(r) {
    setDecisionTarget(null);
    setDisbursementTarget(null);
    setEditId(r.id);
    setForm({
      employee_id: r.employee_id,
      amount: r.amount,
      installments: r.installments,
      first_deduction_month: r.first_deduction_month || '',
      reason: r.reason || '',
    });
    setOpen(true);
    setErr('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    setDecisionTarget(null);
    setDisbursementTarget(null);
    setEditId(null);
    setForm({ ...EMPTY });
    setOpen(true);
    setErr('');
    setMsg('');
  }

  function startDecision(r) {
    setOpen(false);
    setEditId(null);
    setDisbursementTarget(null);
    setDecisionTarget(r);
    setErr('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startDisbursement(r) {
    setOpen(false);
    setEditId(null);
    setDecisionTarget(null);
    setDisbursementTarget(r);
    setDisbursementDate(todayLocal());
    setDisbursementRef('');
    setErr('');
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');

    const payload = {
      employee_id: form.employee_id,
      amount: Number(form.amount),
      installments: Number(form.installments),
      first_deduction_month: form.first_deduction_month || null,
      reason: form.reason,
    };

    const res = editId
      ? await supabase.from('advances').update(payload).eq('id', editId)
      : await supabase.from('advances').insert({ ...payload, status: 'submitted' });

    if (res.error) {
      setErr('تعذّر الحفظ: ' + res.error.message);
      return;
    }

    setMsg(editId ? 'حفظت التعديلات' : 'تم تسجيل طلب السلفة');
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

    const { error } = await supabase.rpc('record_advance_manual_decision', {
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

  async function submitDisbursement(e) {
    e.preventDefault();
    if (!disbursementTarget) return;
    setDisbursementBusy(true);
    setErr('');
    setMsg('');

    const { error } = await supabase.rpc('record_advance_disbursement', {
      p_id: disbursementTarget.id,
      p_disbursed_date: disbursementDate,
      p_reference: disbursementRef.trim() || null,
      p_evidence_path: null,
    });

    setDisbursementBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }

    setMsg('تم تسجيل صرف السلفة وإنشاء جدول الأقساط');
    setDisbursementTarget(null);
    load();
  }

  async function cancel(r) {
    const reason = window.prompt('سبب إلغاء السلفة:');
    if (reason === null) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.rpc('cancel_advance', { p_id: r.id, p_reason: reason });
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg('ألغيت السلفة');
    load();
  }

  async function remove(r) {
    if (!window.confirm('حذف هذا الطلب نهائيًا؟')) return;
    setErr('');
    setMsg('');
    const { error } = await supabase.from('advances').delete().eq('id', r.id);
    if (error) {
      setErr('تعذّر الحذف: ' + error.message);
      return;
    }
    setMsg('حذف الطلب');
    load();
  }

  async function markDeducted(id, val) {
    setErr('');
    const { error } = await supabase.from('advance_installments')
      .update({ is_deducted: val, deducted_at: val ? todayLocal() : null })
      .eq('id', id);
    if (error) setErr('تعذّر التحديث: ' + error.message);
    else load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const debt = (empId) => inst
    .filter((x) => !x.is_deducted && rows.find((r) =>
      r.id === x.advance_id &&
      r.employee_id === empId &&
      r.status === 'ceo_approved' &&
      r.disbursed_at
    ))
    .reduce((t, x) => t + Number(x.amount), 0);

  const disbursed = rows.filter((r) => r.status === 'ceo_approved' && r.disbursed_at);
  const allInst = inst.filter((x) => disbursed.find((r) => r.id === x.advance_id));
  const canEdit = (r) => ['draft','submitted'].includes(r.status);
  const canCancel = (r) => !r.disbursed_at && !['cancelled','rejected'].includes(r.status);
  const decisionStage = decisionTarget ? nextStage('advance', decisionTarget.status) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>السلف والمديونيات</h1>
          <p>الطلبات والاعتمادات والصرف الفعلي وأقساط السداد</p>
        </div>
        <button
          className="btn"
          onClick={open ? () => { setOpen(false); setEditId(null); } : startNew}
        >
          {open ? 'إغلاق النموذج' : 'طلب سلفة جديد'}
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
        الاعتماد والصرف عمليتان منفصلتان. يسجل مستخدم البرنامج صاحب القرار الفعلي أولًا، ثم يسجل واقعة الصرف عند حدوثها. لا تنشأ المديونية والأقساط بمجرد الاعتماد.
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {decisionTarget && decisionStage && (
        <ManualDecisionForm
          requestLabel={`سلفة ${decisionTarget.employees?.full_name_ar || ''}`}
          stageLabel={STAGE_AR[decisionStage]}
          employees={emps}
          busy={decisionBusy}
          onSubmit={submitDecision}
          onClose={() => setDecisionTarget(null)}
        />
      )}

      {disbursementTarget && (
        <div className="section" style={{marginTop:0, marginBottom:18}}>
          <header>
            <div>
              <h2>تسجيل صرف السلفة</h2>
              <p style={{margin:'4px 0 0',color:'var(--ink-soft)',fontSize:13}}>
                {disbursementTarget.employees?.full_name_ar || 'الموظف'} - {money(disbursementTarget.amount)} ريال
              </p>
            </div>
          </header>
          <form onSubmit={submitDisbursement} style={{padding:18}}>
            <div style={{
              marginBottom:16,
              padding:'11px 13px',
              border:'1px solid var(--line)',
              borderRadius:8,
              color:'var(--ink-soft)',
              fontSize:13,
              lineHeight:1.8,
            }}>
              سجل الصرف فقط بعد خروج المبلغ فعليًا. عند الحفظ ستنشأ الأقساط ويبدأ احتساب المديونية على الموظف.
            </div>
            <div className="form-grid">
              <div className="field">
                <label>تاريخ الصرف *</label>
                <input
                  type="date"
                  dir="ltr"
                  required
                  value={disbursementDate}
                  onChange={(e)=>setDisbursementDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>مرجع الصرف</label>
                <input
                  value={disbursementRef}
                  onChange={(e)=>setDisbursementRef(e.target.value)}
                  placeholder="رقم التحويل أو المرجع إن وجد"
                />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit" disabled={disbursementBusy}>
                {disbursementBusy ? 'جارٍ التسجيل' : 'تسجيل الصرف'}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={disbursementBusy}
                onClick={()=>setDisbursementTarget(null)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {open && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل طلب سلفة' : 'طلب سلفة'}</h2></header>
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
                {form.employee_id && (
                  <span className="hint">المديونية القائمة: {money(debt(form.employee_id))} ريال</span>
                )}
              </div>
              <div className="field">
                <label>المبلغ (ريال) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  dir="ltr"
                  value={form.amount}
                  onChange={(e)=>setForm({...form, amount:e.target.value})}
                />
              </div>
              <div className="field">
                <label>عدد الأقساط *</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  required
                  dir="ltr"
                  value={form.installments}
                  onChange={(e)=>setForm({...form, installments:e.target.value})}
                />
              </div>
              <div className="field">
                <label>القسط الشهري</label>
                <input
                  value={per ? per.toFixed(2) : ''}
                  readOnly
                  dir="ltr"
                  style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}}
                />
              </div>
              <div className="field">
                <label>شهر بداية الخصم</label>
                <input
                  type="date"
                  dir="ltr"
                  value={form.first_deduction_month}
                  onChange={(e)=>setForm({...form, first_deduction_month:e.target.value})}
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
        <header><h2>الطلبات</h2></header>
        {rows.length === 0 ? (
          <div className="empty"><h3>لا طلبات</h3><p>سجل أول طلب من الزر أعلى الصفحة.</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الموظف</th><th className="num">المبلغ</th><th className="num">الأقساط</th>
                <th>الحالة</th><th>المرحلة التالية</th><th style={{width:250}}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stage = nextStage('advance', r.status);
                const nextLabel = stage
                  ? STAGE_AR[stage]
                  : r.status === 'ceo_approved' && !r.disbursed_at
                    ? 'تسجيل الصرف'
                    : 'مكتملة';

                return (
                  <tr key={r.id}>
                    <td>{r.employees?.full_name_ar || 'غير محدد'}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="num">{r.installments}</td>
                    <td>
                      <span className={`pill ${STATUS_CLASS[r.status]}`}>{STATUS_AR[r.status]}</span>
                      {r.disbursed_at && (
                        <div style={{fontSize:11.5,color:'var(--ink-soft)',marginTop:3}}>
                          صرفت بتاريخ {dateAr(r.disbursed_at)}
                        </div>
                      )}
                      {r.cancel_reason && (
                        <div style={{fontSize:11.5,color:'var(--ink-soft)',marginTop:3}}>{r.cancel_reason}</div>
                      )}
                    </td>
                    <td style={{fontSize:13,color:'var(--ink-soft)'}}>{nextLabel}</td>
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
                        {r.status === 'ceo_approved' && !r.disbursed_at && (
                          <button
                            className="btn"
                            style={{padding:'4px 9px',fontSize:12.5}}
                            onClick={()=>startDisbursement(r)}
                          >
                            تسجيل الصرف
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

      <div className="section">
        <header>
          <h2>الأقساط</h2>
          <span style={{fontSize:13,color:'var(--ink-soft)'}}>
            غير المخصوم: {money(allInst.filter((x)=>!x.is_deducted).reduce((t,x)=>t+Number(x.amount),0))} ريال
          </span>
        </header>
        {allInst.length === 0 ? (
          <div className="empty"><h3>لا أقساط</h3><p>تنشأ الأقساط بعد تسجيل الصرف الفعلي للسلفة.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الموظف</th><th>شهر الخصم</th><th className="num">القسط</th><th>الحالة</th><th>إجراء</th></tr>
            </thead>
            <tbody>
              {allInst.map((x) => {
                const adv = rows.find((r) => r.id === x.advance_id);
                return (
                  <tr key={x.id}>
                    <td>{adv?.employees?.full_name_ar || 'غير محدد'}</td>
                    <td className="mono">{dateAr(x.due_month)}</td>
                    <td className="num">{money(x.amount)}</td>
                    <td>
                      <span className={`pill ${x.is_deducted ? 'ok' : 'warn'}`}>
                        {x.is_deducted ? `خصم ${dateAr(x.deducted_at)}` : 'قائم'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn ghost"
                        style={{padding:'4px 10px',fontSize:12.5}}
                        onClick={()=>markDeducted(x.id, !x.is_deducted)}
                      >
                        {x.is_deducted ? 'تراجع عن الخصم' : 'تسجيل الخصم'}
                      </button>
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
