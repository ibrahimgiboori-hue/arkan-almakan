'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';

export default function NewDocument() {
  const { code } = useParams();
  const router = useRouter();
  const tpl = byCode(code);

  const [v, setV] = useState({});
  const [lang, setLang] = useState('ar');
  const [emps, setEmps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (tpl?.text?.default) setV((s) => ({ ...s, [tpl.text.k]: tpl.text.default }));
    supabase.from('employees')
      .select('id, employee_no, full_name_ar, job_title, id_number, hire_date, basic_salary, housing_allowance, transport_allowance, other_allowance')
      .order('employee_no')
      .then(({ data }) => setEmps(data || []));
  }, [code]);

  if (!tpl) return <div className="msg err">هذا النموذج غير معروف.</div>;

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  function pickEmployee(e) {
    const emp = emps.find((x) => x.id === e.target.value);
    if (!emp) return;
    const allow = Number(emp.housing_allowance||0) + Number(emp.transport_allowance||0) + Number(emp.other_allowance||0);
    setV({
      ...v,
      employee_name: emp.full_name_ar,
      employee_no: emp.employee_no,
      job_title: emp.job_title || '',
      current_title: emp.job_title || '',
      id_number: emp.id_number || '',
      hire_date: emp.hire_date || '',
      basic_salary: emp.basic_salary || '',
      current_salary: emp.basic_salary || '',
      last_wage: Number(emp.basic_salary||0) + allow,
      allowances: allow,
      gross: Number(emp.basic_salary||0) + allow,
      housing: emp.housing_allowance || '',
      transport: emp.transport_allowance || '',
      _employee_id: emp.id,
    });
  }

  async function issue(e) {
    e.preventDefault();
    setErr(''); setBusy(true);

    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: tpl.code, p_prefix: tpl.prefix });

    if (e1 || !num) {
      setErr('تعذّر توليد رقم المستند. أعد المحاولة أو تحقق من صلاحيات حسابك.');
      setBusy(false); return;
    }

    const payload = { ...v };
    const employee_id = payload._employee_id || null;
    delete payload._employee_id;

    const subject = tpl.name + (payload.employee_name ? ' — ' + payload.employee_name
                   : payload.candidate_name ? ' — ' + payload.candidate_name
                   : payload.name ? ' — ' + payload.name : '');

    const { data, error } = await supabase.from('documents').insert({
      doc_number: num, template_code: tpl.code, language: lang,
      subject, employee_id, payload, status: 'draft',
    }).select('id').single();

    setBusy(false);

    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'لا تملك صلاحية إصدار المستندات. هذه الصلاحية للمدير التنفيذي والموارد البشرية والمحاسب.'
        : 'تعذّر الحفظ: ' + error.message);
      return;
    }

    window.open(`/print/${data.id}`, '_blank');
    router.push('/dashboard/documents');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tpl.name}</h1>
          <p>يُرقَّم تلقائياً بالبادئة <span className="mono">{tpl.prefix}</span> عند الإصدار</p>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:16}}>{err}</div>}

      <form onSubmit={issue}>
        <div className="section" style={{marginTop:0}}>
          <div style={{padding:'18px'}}>

            <div className="form-grid">
              <div className="field">
                <label>لغة المستند</label>
                <select value={lang} onChange={(e)=>setLang(e.target.value)}>
                  <option value="ar">عربي</option>
                  <option value="en">English</option>
                </select>
              </div>
              {emps.length > 0 && (
                <div className="field span2">
                  <label>تعبئة سريعة من ملف موظف</label>
                  <select onChange={pickEmployee} defaultValue="">
                    <option value="">— اختر موظفاً —</option>
                    {emps.map((e) => (
                      <option key={e.id} value={e.id}>{e.employee_no} — {e.full_name_ar}</option>
                    ))}
                  </select>
                  <span className="hint">يعبّئ الاسم والمسمى والراتب تلقائياً</span>
                </div>
              )}
            </div>

            <fieldset>
              <legend>بيانات النموذج</legend>
              <div className="form-grid">
                {tpl.fields.map((f) => (
                  <div className="field" key={f.k}>
                    <label>{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'select' ? (
                      <select required={f.required} value={v[f.k] || ''} onChange={set(f.k)}>
                        <option value="">—</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || 'text'} required={f.required}
                             dir={f.type === 'date' || f.type === 'number' ? 'ltr' : undefined}
                             step={f.type === 'number' ? 'any' : undefined}
                             value={v[f.k] || ''} onChange={set(f.k)} />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>

            {tpl.text && (
              <fieldset>
                <legend>{tpl.text.label}</legend>
                <textarea rows={tpl.text.rows || 4} style={{width:'100%'}}
                          value={v[tpl.text.k] || ''} onChange={set(tpl.text.k)} />
              </fieldset>
            )}

          </div>
        </div>

        <div className="rowsplit" style={{marginTop:18}}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الإصدار…' : 'إصدار المستند'}
          </button>
          <button className="btn ghost" type="button" onClick={()=>router.back()}>إلغاء</button>
        </div>
      </form>
    </>
  );
}
