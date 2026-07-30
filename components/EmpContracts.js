'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';

const EMPTY = {
  contract_kind:'indefinite', start_date:'', end_date:'', notice_period_days:60,
  probation_days:90, annual_leave_days:21, job_title:'',
  basic_salary:0, housing_allowance:0, transport_allowance:0, other_allowance:0,
  signed_at:'', notes:'',
};

export default function EmpContracts({ employeeId, employee }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => supabase.from('employment_contracts')
    .select('*').eq('employee_id', employeeId).order('start_date', { ascending: false })
    .then(({ data }) => setRows(data || []));

  useEffect(() => { load(); }, [employeeId]);

  function startNew() {
    setF({
      ...EMPTY,
      job_title: employee?.job_title || '',
      basic_salary: employee?.basic_salary || 0,
      housing_allowance: employee?.housing_allowance || 0,
      transport_allowance: employee?.transport_allowance || 0,
      other_allowance: employee?.other_allowance || 0,
      start_date: employee?.hire_date || '',
    });
    setOpen(true);
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');

    if (f.contract_kind === 'fixed_term' && !f.end_date) {
      setErr('العقد محدد المدة يلزمه تاريخ نهاية.'); return;
    }
    if (f.contract_kind === 'indefinite' && f.end_date) {
      setErr('العقد غير محدد المدة لا يقبل تاريخ نهاية — اتركه فارغاً.'); return;
    }

    // إنهاء سِمة "الحالي" عن العقود السابقة
    await supabase.from('employment_contracts')
      .update({ is_current: false }).eq('employee_id', employeeId).eq('is_current', true);

    const payload = {
      ...f, employee_id: employeeId, is_current: true,
      end_date: f.end_date || null, signed_at: f.signed_at || null,
      notice_period_days: Number(f.notice_period_days || 0),
      probation_days: Number(f.probation_days || 0),
      annual_leave_days: Number(f.annual_leave_days || 21),
      basic_salary: Number(f.basic_salary || 0),
      housing_allowance: Number(f.housing_allowance || 0),
      transport_allowance: Number(f.transport_allowance || 0),
      other_allowance: Number(f.other_allowance || 0),
    };

    const { error } = await supabase.from('employment_contracts').insert(payload);
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('تم حفظ العقد'); setOpen(false); load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const KIND = { fixed_term:'محدد المدة', indefinite:'غير محدد المدة' };

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="rowsplit" style={{marginBottom:14}}>
        <button className="btn" onClick={open ? ()=>setOpen(false) : startNew}>
          {open ? 'إغلاق' : 'عقد جديد'}
        </button>
        <span style={{fontSize:13,color:'var(--ink-soft)'}}>
          العقد الجديد يُصبح الحالي، والسابق يُحفظ في السجل
        </span>
      </div>

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0,padding:18}}>
          <div className="form-grid">
            <div className="field">
              <label>نوع العقد *</label>
              <select value={f.contract_kind} onChange={set('contract_kind')}>
                <option value="indefinite">غير محدد المدة</option>
                <option value="fixed_term">محدد المدة</option>
              </select>
            </div>
            <div className="field">
              <label>تاريخ البداية *</label>
              <input type="date" required dir="ltr" value={f.start_date} onChange={set('start_date')} />
            </div>
            <div className="field">
              <label>تاريخ النهاية</label>
              <input type="date" dir="ltr" value={f.end_date} onChange={set('end_date')}
                     disabled={f.contract_kind === 'indefinite'} />
              <span className="hint">للعقود محددة المدة فقط</span>
            </div>
            <div className="field">
              <label>فترة الإشعار (يوم)</label>
              <input type="number" min="0" dir="ltr" value={f.notice_period_days} onChange={set('notice_period_days')} />
            </div>
            <div className="field">
              <label>فترة التجربة (يوم)</label>
              <input type="number" min="0" dir="ltr" value={f.probation_days} onChange={set('probation_days')} />
            </div>
            <div className="field">
              <label>الإجازة السنوية (يوم)</label>
              <input type="number" min="0" dir="ltr" value={f.annual_leave_days} onChange={set('annual_leave_days')} />
            </div>
            <div className="field">
              <label>المسمى في العقد</label>
              <input value={f.job_title} onChange={set('job_title')} />
            </div>
            <div className="field">
              <label>الراتب الأساسي</label>
              <input type="number" min="0" step="0.01" dir="ltr" value={f.basic_salary} onChange={set('basic_salary')} />
            </div>
            <div className="field">
              <label>بدل السكن</label>
              <input type="number" min="0" step="0.01" dir="ltr" value={f.housing_allowance} onChange={set('housing_allowance')} />
            </div>
            <div className="field">
              <label>بدل النقل</label>
              <input type="number" min="0" step="0.01" dir="ltr" value={f.transport_allowance} onChange={set('transport_allowance')} />
            </div>
            <div className="field">
              <label>بدلات أخرى</label>
              <input type="number" min="0" step="0.01" dir="ltr" value={f.other_allowance} onChange={set('other_allowance')} />
            </div>
            <div className="field">
              <label>تاريخ التوقيع</label>
              <input type="date" dir="ltr" value={f.signed_at} onChange={set('signed_at')} />
            </div>
          </div>
          <button className="btn" type="submit">حفظ العقد</button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="section" style={{marginTop:0}}>
          <div className="empty">
            <h3>لا عقد مسجَّل</h3>
            <p>أضف عقد الموظف لتُحسب فترة الإشعار ومكافأة نهاية الخدمة على أساسه.</p>
          </div>
        </div>
      ) : (
        <div className="section" style={{marginTop:0}}>
          <table>
            <thead>
              <tr><th>النوع</th><th>من</th><th>إلى</th><th className="num">الإشعار</th>
                  <th className="num">الأساسي</th><th className="num">الإجمالي</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const gross = Number(c.basic_salary||0)+Number(c.housing_allowance||0)
                            + Number(c.transport_allowance||0)+Number(c.other_allowance||0);
                return (
                  <tr key={c.id}>
                    <td>{KIND[c.contract_kind]}</td>
                    <td className="mono">{dateAr(c.start_date)}</td>
                    <td className="mono">{c.end_date ? dateAr(c.end_date) : 'مفتوح'}</td>
                    <td className="num">{c.notice_period_days} يوم</td>
                    <td className="num">{money(c.basic_salary)}</td>
                    <td className="num">{money(gross)}</td>
                    <td>
                      <span className={`pill ${c.is_current ? 'ok' : ''}`}>
                        {c.is_current ? 'العقد الحالي' : 'سابق'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
