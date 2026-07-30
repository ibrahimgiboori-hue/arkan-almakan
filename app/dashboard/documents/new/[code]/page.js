'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { applyLogic, uid } from '@/lib/form-engine';
import { money } from '@/lib/format';

export default function NewDocument() {
  const { code } = useParams();
  const router = useRouter();

  const [tpl, setTpl] = useState(null);       // من قاعدة البيانات
  const [legacy, setLegacy] = useState(null); // من سجل الكود
  const [v, setV] = useState({});
  const [rows, setRows] = useState([]);
  const [lang, setLang] = useState('ar');
  const [emps, setEmps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('document_templates')
        .select('*').eq('code', code).maybeSingle();
      const jsTpl = byCode(code);

      if (data?.is_custom && data?.layout?.sections?.length) {
        setTpl(data);
        const init = {};
        (data.layout.sections || []).forEach((s) => {
          if (s.kind === 'text' && s.key) init[s.key] = '';
        });
        setV(init);
        const hasTable = (data.layout.sections || []).some((s) => s.kind === 'table');
        if (hasTable) setRows([{ _id: uid() }]);
      } else if (jsTpl) {
        setLegacy(jsTpl);
        if (jsTpl.text?.default) setV({ [jsTpl.text.k]: jsTpl.text.default });
      } else {
        setErr('هذا النموذج غير معروف.');
      }

      const { data: e } = await supabase.from('employees')
        .select('id, employee_no, full_name_ar, job_title, id_number, hire_date, basic_salary, housing_allowance, transport_allowance, other_allowance')
        .order('employee_no');
      setEmps(e || []);
    })();
  }, [code]);

  // تطبيق المعادلات مباشرة أثناء الكتابة
  const computed = useMemo(() => {
    if (!tpl) return { payload: v, rows };
    return applyLogic(v, rows, tpl.logic || []);
  }, [tpl, v, rows]);

  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  function setRow(id, k, val) {
    setRows(rows.map((r) => r._id === id ? { ...r, [k]: val } : r));
  }
  const addRow = () => setRows([...rows, { _id: uid() }]);
  const delRow = (id) => setRows(rows.filter((r) => r._id !== id));

  function pickEmployee(e) {
    const emp = emps.find((x) => x.id === e.target.value);
    if (!emp) return;
    const allow = Number(emp.housing_allowance||0) + Number(emp.transport_allowance||0)
                + Number(emp.other_allowance||0);
    setV({
      ...v,
      employee_name: emp.full_name_ar, employee_no: emp.employee_no,
      job_title: emp.job_title || '', current_title: emp.job_title || '',
      id_number: emp.id_number || '', hire_date: emp.hire_date || '',
      basic_salary: emp.basic_salary || '', current_salary: emp.basic_salary || '',
      last_wage: Number(emp.basic_salary||0) + allow, allowances: allow,
      gross: Number(emp.basic_salary||0) + allow,
      housing: emp.housing_allowance || '', transport: emp.transport_allowance || '',
      _employee_id: emp.id,
    });
  }

  async function issue(e) {
    e.preventDefault();
    setErr(''); setBusy(true);

    const meta = tpl || legacy;
    const prefix = tpl ? tpl.prefix : legacy.prefix;

    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: code, p_prefix: prefix });
    if (e1 || !num) {
      setErr('تعذّر توليد رقم المستند. تحقق من صلاحيات حسابك.');
      setBusy(false); return;
    }

    const finalPayload = tpl
      ? { ...computed.payload, _rows: computed.rows }
      : { ...v };

    const employee_id = finalPayload._employee_id || null;
    delete finalPayload._employee_id;

    const name = tpl ? tpl.name_ar : legacy.name;
    const who = finalPayload.employee_name || finalPayload.candidate_name
             || finalPayload.name || finalPayload.contractor || '';
    const subject = name + (who ? ' — ' + who : '');

    const { data, error } = await supabase.from('documents').insert({
      doc_number: num, template_code: code, language: lang,
      subject, employee_id, payload: finalPayload, status: 'draft',
    }).select('id').single();

    setBusy(false);
    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'لا تملك صلاحية إصدار المستندات.'
        : 'تعذّر الحفظ: ' + error.message);
      return;
    }
    window.open(`/print/${data.id}`, '_blank');
    router.push('/dashboard/documents');
  }

  if (err && !tpl && !legacy) return <div className="msg err">{err}</div>;
  if (!tpl && !legacy) return <div className="empty">جارٍ التحميل…</div>;

  const title = tpl ? tpl.name_ar : legacy.name;
  const prefix = tpl ? tpl.prefix : legacy.prefix;

  const inputFor = (f, value, onChange) => (
    f.type === 'select' ? (
      <select value={value || ''} onChange={onChange} required={f.required}>
        <option value="">—</option>
        {(f.options || []).map((o)=><option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input
        type={f.type === 'money' || f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
        step={f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined}
        dir={['money','number','date'].includes(f.type) ? 'ltr' : undefined}
        required={f.required} value={value ?? ''} onChange={onChange}
        readOnly={f.computed}
        style={f.computed ? {background:'#F6EEEE',color:'#7C2B28',fontWeight:600} : undefined}
      />
    )
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>يُرقَّم تلقائياً بالبادئة <span className="mono">{prefix}</span> عند الإصدار
            {tpl ? ' — نموذج مخصص' : ''}</p>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:16}}>{err}</div>}

      <form onSubmit={issue}>
        <div className="section" style={{marginTop:0,padding:18}}>
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
                  {emps.map((e)=>(
                    <option key={e.id} value={e.id}>{e.employee_no} — {e.full_name_ar}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ---------- نموذج مخصص: يُرسم من التخطيط ---------- */}
        {tpl && (tpl.layout.sections || []).map((s) => (
          <div className="section" key={s.id}>
            <header>
              <h2>{s.title || ''}</h2>
              <span style={{fontSize:12,color:'var(--ink-soft)'}}>
                {s.style === 'strict' ? 'قسم مالي أو إلزامي' : 'بطاقة معلومات'}
              </span>
            </header>

            {(s.kind === 'cards' || s.kind === 'totals') && (
              <div style={{padding:18}}>
                <div className="form-grid">
                  {(s.fields || []).map((f) => (
                    <div className="field" key={f.key}
                         style={{gridColumn: `span ${Math.min(3, Math.max(1, Math.round(Number(f.span||4)/4)))}`}}>
                      <label>{f.label}{f.required ? ' *' : ''}{f.computed ? ' (محسوب)' : ''}</label>
                      {inputFor(f, computed.payload[f.key], set(f.key))}
                    </div>
                  ))}
                  {(s.fields || []).length === 0 && (
                    <span style={{color:'var(--ink-soft)',fontSize:13.5}}>لا حقول في هذا القسم.</span>
                  )}
                </div>
              </div>
            )}

            {s.kind === 'table' && (
              <>
                <div style={{padding:'12px 18px'}}>
                  <button type="button" className="btn ghost" onClick={addRow}>+ سطر</button>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{width:40}}>م</th>
                        {(s.columns || []).map((c)=><th key={c.key}>{c.label}</th>)}
                        <th style={{width:60}}>—</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.rows.map((r, i) => (
                        <tr key={r._id}>
                          <td className="mono">{i+1}</td>
                          {(s.columns || []).map((c) => (
                            <td key={c.key}>
                              {c.computed
                                ? <span className="mono">{money(r[c.key] || 0)}</span>
                                : <input
                                    type={['money','number'].includes(c.type) ? 'number'
                                        : c.type === 'date' ? 'date' : 'text'}
                                    step={c.type === 'money' ? '0.01' : c.type === 'number' ? 'any' : undefined}
                                    dir={['money','number','date'].includes(c.type) ? 'ltr' : undefined}
                                    value={rows.find((x)=>x._id===r._id)?.[c.key] ?? ''}
                                    onChange={(e)=>setRow(r._id, c.key,
                                      ['money','number'].includes(c.type) ? Number(e.target.value||0) : e.target.value)}
                                    style={{width:'100%',border:'1px solid var(--hair)',padding:'4px 6px',
                                            fontFamily:'inherit',fontSize:13.5}} />}
                            </td>
                          ))}
                          <td>
                            <button type="button" className="btn ghost"
                                    style={{padding:'3px 8px',fontSize:12}}
                                    onClick={()=>delRow(r._id)}>حذف</button>
                          </td>
                        </tr>
                      ))}
                      {computed.rows.length === 0 && (
                        <tr><td colSpan={(s.columns||[]).length + 2}>
                          <div className="empty"><h3>لا أسطر</h3><p>أضف سطراً من الزر أعلاه.</p></div>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {s.kind === 'text' && (
              <div style={{padding:18}}>
                <textarea rows="4" style={{width:'100%'}}
                          value={v[s.key] || ''} onChange={set(s.key)} />
              </div>
            )}

            {s.kind === 'signatures' && (
              <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)'}}>
                أعمدة التواقيع تُطبع فارغة: {(s.roles||[]).join(' · ')}
              </div>
            )}
          </div>
        ))}

        {/* ---------- نموذج مدمج: سجل الكود ---------- */}
        {legacy && (
          <div className="section">
            <div style={{padding:18}}>
              <fieldset style={{borderTop:'none',paddingTop:0}}>
                <legend>بيانات النموذج</legend>
                <div className="form-grid">
                  {legacy.fields.map((f) => (
                    <div className="field" key={f.k}>
                      <label>{f.label}{f.required ? ' *' : ''}</label>
                      {f.type === 'select' ? (
                        <select required={f.required} value={v[f.k] || ''} onChange={set(f.k)}>
                          <option value="">—</option>
                          {f.options.map((o)=><option key={o} value={o}>{o}</option>)}
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
              {legacy.text && (
                <fieldset>
                  <legend>{legacy.text.label}</legend>
                  <textarea rows={legacy.text.rows || 4} style={{width:'100%'}}
                            value={v[legacy.text.k] || ''} onChange={set(legacy.text.k)} />
                </fieldset>
              )}
            </div>
          </div>
        )}

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
