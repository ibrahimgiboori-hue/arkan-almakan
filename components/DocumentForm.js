'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { applyLogic, uid } from '@/lib/form-engine';
import { money } from '@/lib/format';

export default function DocumentForm({ code, docId }) {
  const router = useRouter();

  const [tpl, setTpl] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [doc, setDoc] = useState(null);
  const [v, setV] = useState({});
  const [rows, setRows] = useState([]);
  const [lang, setLang] = useState('ar');
  const [emps, setEmps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(()=>setMsg(''), 1600); };

  // ---------- التحميل ----------
  const load = useCallback(async () => {
    let theCode = code;
    let d = null;

    if (docId) {
      const r = await supabase.from('documents').select('*').eq('id', docId).maybeSingle();
      if (!r.data) { setErr('لم يُعثر على هذا المستند.'); return; }
      d = r.data; theCode = d.template_code;
      setDoc(d); setLang(d.language || 'ar');
      const pl = d.payload || {};
      setRows(pl._rows || []);
      const clean = { ...pl }; delete clean._rows;
      setV(clean);
    }

    const { data: t } = await supabase.from('document_templates')
      .select('*').eq('code', theCode).maybeSingle();
    const js = byCode(theCode);

    if (t?.is_custom && t?.layout?.sections?.length) {
      setTpl(t);
      if (!docId) {
        const init = {};
        (t.layout.sections || []).forEach((s) => {
          if (s.kind === 'text' && s.key) init[s.key] = '';
        });
        setV(init);
        if ((t.layout.sections || []).some((s)=>s.kind === 'table')) setRows([{ _id: uid() }]);
      }
    } else if (js) {
      setLegacy(js);
      if (!docId && js.text?.default) setV({ [js.text.k]: js.text.default });
    } else {
      setErr('هذا النموذج غير معروف.');
    }

    const { data: e } = await supabase.from('employees')
      .select('id, employee_no, full_name_ar, job_title, id_number, hire_date, mobile, basic_salary, housing_allowance, transport_allowance, other_allowance')
      .order('employee_no');
    setEmps(e || []);
  }, [code, docId]);

  useEffect(() => { load(); }, [load]);

  const computed = useMemo(() => {
    if (!tpl) return { payload: v, rows };
    return applyLogic(v, rows, tpl.logic || []);
  }, [tpl, v, rows]);

  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setDirty(true); };
  const setRow = (id, k, val) => {
    setRows(rows.map((r)=>r._id===id ? {...r,[k]:val} : r)); setDirty(true);
  };
  const addRow = () => { setRows([...rows, { _id: uid() }]); setDirty(true); };
  const delRow = (id) => { setRows(rows.filter((r)=>r._id!==id)); setDirty(true); };

  function pickEmployee(e) {
    const emp = emps.find((x)=>x.id===e.target.value);
    if (!emp) return;
    const allow = Number(emp.housing_allowance||0)+Number(emp.transport_allowance||0)
                + Number(emp.other_allowance||0);
    setV({ ...v,
      employee_name: emp.full_name_ar, employee_no: emp.employee_no,
      job_title: emp.job_title || '', current_title: emp.job_title || '',
      id_number: emp.id_number || '', hire_date: emp.hire_date || '',
      sender_name: v.sender_name || emp.full_name_ar,
      sender_title: v.sender_title || emp.job_title || '',
      sender_id: v.sender_id || emp.id_number || '',
      sender_mobile: v.sender_mobile || emp.mobile || '',
      basic_salary: emp.basic_salary || '', current_salary: emp.basic_salary || '',
      last_wage: Number(emp.basic_salary||0)+allow, allowances: allow,
      gross: Number(emp.basic_salary||0)+allow,
      housing: emp.housing_allowance || '', transport: emp.transport_allowance || '',
      _employee_id: emp.id,
    });
    setDirty(true);
  }

  // ---------- الحفظ كمسودة ----------
  async function saveDraft(silent) {
    setErr('');
    const meta = tpl || legacy;
    if (!meta) return null;

    const payload = tpl
      ? { ...computed.payload, _rows: computed.rows }
      : { ...v };
    const employee_id = payload._employee_id || null;
    delete payload._employee_id;

    const name = tpl ? tpl.name_ar : legacy.name;
    const who = payload.letter_title || payload.employee_name || payload.candidate_name
             || payload.name || payload.contractor || '';
    const subject = payload.letter_title || (name + (who ? ' — ' + who : ''));

    if (doc) {
      const { error } = await supabase.from('documents')
        .update({ payload, language: lang, subject, employee_id }).eq('id', doc.id);
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return null; }
      setDirty(false);
      if (!silent) flash('حُفظت المسودة');
      return doc.id;
    }

    const { data, error } = await supabase.from('documents').insert({
      doc_number: 'DRAFT-' + uid().toUpperCase(),
      template_code: tpl ? tpl.code : legacy.code,
      language: lang, subject, employee_id, payload, status: 'draft',
    }).select('*').single();

    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'لا تملك صلاحية إنشاء المستندات.' : 'تعذّر الحفظ: ' + error.message);
      return null;
    }
    setDoc(data); setDirty(false);
    if (!silent) flash('حُفظت المسودة');
    router.replace(`/dashboard/documents/edit/${data.id}`);
    return data.id;
  }

  // ---------- المعاينة ----------
  async function preview() {
    setBusy(true);
    const id = await saveDraft(true);
    setBusy(false);
    if (id) window.open(`/print/${id}`, '_blank');
  }

  // ---------- الإصدار النهائي ----------
  async function issue() {
    setBusy(true); setErr('');
    const id = await saveDraft(true);
    if (!id) { setBusy(false); return; }
    const { data, error } = await supabase.rpc('issue_document', { p_id: id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    flash('صدر المستند برقم ' + data);
    load();
    window.open(`/print/${id}`, '_blank');
  }

  async function revert() {
    const reason = window.prompt('سبب إعادة المستند لمسودة:');
    if (reason === null) return;
    const { error } = await supabase.rpc('revert_to_draft',
      { p_id: doc.id, p_reason: reason });
    if (error) setErr(error.message); else { flash('أُعيد لمسودة'); load(); }
  }

  if (err && !tpl && !legacy) return <div className="msg err">{err}</div>;
  if (!tpl && !legacy) return <div className="empty">جارٍ التحميل…</div>;

  const title = tpl ? tpl.name_ar : legacy.name;
  const isIssued = !!doc?.issued_at;
  const fillFields = tpl?.layout?.fill_fields || [];

  const inputFor = (f, value, onChange) => (
    f.type === 'select' ? (
      <select value={value || ''} onChange={onChange} required={f.required} disabled={isIssued}>
        <option value="">—</option>
        {(f.options || []).map((o)=><option key={o} value={o}>{o}</option>)}
      </select>
    ) : f.rows || f.type === 'textarea' ? (
      <textarea rows={f.rows || 3} value={value ?? ''} onChange={onChange} disabled={isIssued} />
    ) : (
      <input
        type={['money','number'].includes(f.type) ? 'number'
            : f.type === 'date' ? 'date' : 'text'}
        step={f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined}
        dir={['money','number','date'].includes(f.type) ? 'ltr' : undefined}
        required={f.required} value={value ?? ''} onChange={onChange}
        readOnly={f.computed} disabled={isIssued}
        style={f.computed ? {background:'#F6EEEE',color:'#7C2B28',fontWeight:600} : undefined}
      />
    )
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>
            {doc ? (
              isIssued
                ? <>صادر برقم <span className="mono">{doc.doc_number}</span></>
                : <>مسودة — تُعدَّل وتُعاين قبل الإصدار</>
            ) : 'مسودة جديدة — احفظها لتعاينها'}
            {dirty && <span style={{color:'var(--warn)'}}> · تغييرات غير محفوظة</span>}
          </p>
        </div>
        <Link className="btn ghost" href="/dashboard/documents">كل المستندات</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
      {isIssued && (
        <div className="msg err" style={{marginBottom:14}}>
          هذا المستند صادر برقم نهائي فلا يُعدَّل. لتعديله أعِده لمسودة، أو انسخه نسخة جديدة.
        </div>
      )}

      {/* شريط الإجراءات — لاصق */}
      <div className="rowsplit stickybar">
        {!isIssued && (
          <>
            <button className="btn ghost" disabled={busy} onClick={()=>saveDraft(false)}>
              حفظ المسودة
            </button>
            <button className="btn ghost" disabled={busy} onClick={preview}>
              حفظ ومعاينة
            </button>
            <button className="btn" disabled={busy} onClick={issue}>
              إصدار نهائي برقم
            </button>
          </>
        )}
        {isIssued && (
          <>
            <a className="btn" href={`/print/${doc.id}`} target="_blank" rel="noreferrer">
              فتح للطباعة
            </a>
            <button className="btn ghost" onClick={revert}>إعادة لمسودة للتعديل</button>
          </>
        )}
        <span className="spacer" />
        <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>
          لا يُحجز رقم المستند إلا عند الإصدار النهائي
        </span>
      </div>

      <div className="section" style={{marginTop:0,padding:18}}>
        <div className="form-grid">
          <div className="field">
            <label>لغة المستند</label>
            <select value={lang} onChange={(e)=>{setLang(e.target.value);setDirty(true);}}
                    disabled={isIssued}>
              <option value="ar">عربي</option>
              <option value="en">English</option>
            </select>
          </div>
          {emps.length > 0 && !isIssued && (
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

      {/* حقول التعبئة العامة */}
      {fillFields.length > 0 && (
        <div className="section">
          <header><h2>بيانات المستند</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              {fillFields.map((f)=>(
                <div className="field" key={f.key}
                     style={{gridColumn:`span ${Math.min(3, Math.max(1, Math.round(Number(f.span||4)/4)))}`}}>
                  <label>{f.label}{f.required ? ' *' : ''}</label>
                  {inputFor(f, computed.payload[f.key], set(f.key))}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* أقسام النموذج المخصص */}
      {tpl && (tpl.layout.sections || []).map((s) => (
        <div className="section" key={s.id}>
          <header>
            <h2>{s.title || (s.kind === 'letterhead' ? 'ترويسة الخطاب'
                  : s.kind === 'stampbox' ? 'الختم والتوقيع' : '')}</h2>
          </header>

          {(s.kind === 'cards' || s.kind === 'totals') && (
            <div style={{padding:18}}>
              <div className="form-grid">
                {(s.fields || []).map((f)=>(
                  <div className="field" key={f.key}
                       style={{gridColumn:`span ${Math.min(3, Math.max(1, Math.round(Number(f.span||4)/4)))}`}}>
                    <label>{f.label}{f.required ? ' *' : ''}{f.computed ? ' (محسوب)' : ''}</label>
                    {inputFor(f, computed.payload[f.key], set(f.key))}
                  </div>
                ))}
                {(s.fields || []).length === 0 && (
                  <span style={{color:'var(--ink-soft)',fontSize:13.5}}>لا حقول.</span>
                )}
              </div>
            </div>
          )}

          {s.kind === 'table' && (
            <>
              {!isIssued && (
                <div style={{padding:'12px 18px'}}>
                  <button type="button" className="btn ghost" onClick={addRow}>+ سطر</button>
                </div>
              )}
              <div style={{overflowX:'auto'}}>
                <table>
                  <thead>
                    <tr>
                      <th style={{width:40}}>م</th>
                      {(s.columns || []).map((c)=><th key={c.key}>{c.label}</th>)}
                      {!isIssued && <th style={{width:60}}>—</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {computed.rows.map((r,i)=>(
                      <tr key={r._id}>
                        <td className="mono">{i+1}</td>
                        {(s.columns || []).map((c)=>(
                          <td key={c.key}>
                            {c.computed
                              ? <span className="mono">{money(r[c.key] || 0)}</span>
                              : <input
                                  type={['money','number'].includes(c.type) ? 'number'
                                      : c.type === 'date' ? 'date' : 'text'}
                                  step={c.type === 'money' ? '0.01' : c.type === 'number' ? 'any' : undefined}
                                  dir={['money','number','date'].includes(c.type) ? 'ltr' : undefined}
                                  value={rows.find((x)=>x._id===r._id)?.[c.key] ?? ''}
                                  disabled={isIssued}
                                  onChange={(e)=>setRow(r._id, c.key,
                                    ['money','number'].includes(c.type)
                                      ? Number(e.target.value||0) : e.target.value)}
                                  style={{width:'100%',border:'1px solid var(--hair)',
                                          padding:'4px 6px',fontFamily:'inherit',fontSize:13.5}} />}
                          </td>
                        ))}
                        {!isIssued && (
                          <td>
                            <button type="button" className="btn ghost"
                                    style={{padding:'3px 8px',fontSize:12}}
                                    onClick={()=>delRow(r._id)}>حذف</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {computed.rows.length === 0 && (
                      <tr><td colSpan={(s.columns||[]).length + 2}>
                        <div className="empty"><h3>لا أسطر</h3><p>أضف سطراً.</p></div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {s.kind === 'text' && (
            <div style={{padding:18}}>
              <textarea rows={s.style === 'plain' ? 12 : 4} style={{width:'100%'}}
                        value={v[s.key] || ''} onChange={set(s.key)} disabled={isIssued} />
            </div>
          )}

          {(s.kind === 'letterhead' || s.kind === 'stampbox') && (
            <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)'}}>
              {s.kind === 'letterhead'
                ? 'يُبنى من بيانات المستند أعلاه: العنوان في سطر، والجهة يميناً والصفة يساراً.'
                : 'مربع الختم والتوقيع أسفل الصفحة — يظهر فقط إن رُفعت صورهما.'}
            </div>
          )}

          {s.kind === 'signatures' && (
            <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)'}}>
              أعمدة التواقيع تُطبع فارغة: {(s.roles||[]).join(' · ')}
            </div>
          )}
        </div>
      ))}

      {/* النماذج المدمجة */}
      {legacy && (
        <div className="section">
          <div style={{padding:18}}>
            <fieldset style={{borderTop:'none',paddingTop:0}}>
              <legend>بيانات النموذج</legend>
              <div className="form-grid">
                {legacy.fields.map((f)=>(
                  <div className="field" key={f.k}>
                    <label>{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'select' ? (
                      <select required={f.required} value={v[f.k] || ''}
                              onChange={set(f.k)} disabled={isIssued}>
                        <option value="">—</option>
                        {f.options.map((o)=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || 'text'} required={f.required}
                             dir={f.type === 'date' || f.type === 'number' ? 'ltr' : undefined}
                             step={f.type === 'number' ? 'any' : undefined}
                             value={v[f.k] || ''} onChange={set(f.k)} disabled={isIssued} />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
            {legacy.text && (
              <fieldset>
                <legend>{legacy.text.label}</legend>
                <textarea rows={legacy.text.rows || 4} style={{width:'100%'}}
                          value={v[legacy.text.k] || ''} onChange={set(legacy.text.k)}
                          disabled={isIssued} />
              </fieldset>
            )}
          </div>
        </div>
      )}
    </>
  );
}
