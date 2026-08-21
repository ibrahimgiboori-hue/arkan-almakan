'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { applyLogic, uid } from '@/lib/form-engine';
import { money } from '@/lib/format';
import { personLabel } from '@/lib/people';
import PartiesEditor from '@/components/PartiesEditor';

export default function DocumentForm({ code, docId }) {
  const router = useRouter();

  const [tpl, setTpl] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [doc, setDoc] = useState(null);
  const [v, setV] = useState({});
  const [rows, setRows] = useState([]);
  const [parties, setParties] = useState(null);
  const [lang, setLang] = useState('ar');
  const [emps, setEmps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [issuerEmployeeId, setIssuerEmployeeId] = useState('');
  const [signatoryEmployeeId, setSignatoryEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(()=>setMsg(''), 1600); };

  const load = useCallback(async () => {
    let theCode = code;
    let d = null;

    if (docId) {
      const r = await supabase.from('documents').select('*').eq('id', docId).maybeSingle();
      if (!r.data) { setErr('لم يعثر على هذا المستند.'); return; }
      d = r.data;
      theCode = d.template_code;
      setDoc(d);
      setLang(d.language || 'ar');
      setIssuerEmployeeId(d.issuer_employee_id || '');
      setSignatoryEmployeeId(d.signatory_employee_id || '');
      setEmployeeId(d.employee_id || '');
      setProjectId(d.project_id || '');
      const pl = d.payload || {};
      setRows(pl._rows || []);
      const clean = { ...pl };
      delete clean._rows;
      setV(clean);
      setParties(d.parties && Object.keys(d.parties).length ? d.parties : null);
    }

    const { data: t } = await supabase.from('document_templates')
      .select('*').eq('code', theCode).maybeSingle();
    const js = byCode(theCode);

    if (t?.layout?.sections?.length) {
      setTpl(t);
      if (!docId && t.parties_layout && t.parties_layout !== 'none') {
        const { data: init } = await supabase.rpc('init_parties', {
          p_layout: t.parties_layout,
          p_with_arkan: t.parties_layout !== 'single',
        });
        if (init) setParties(init);
      }
      if (!docId) {
        const init = {};
        (t.layout.sections || []).forEach((s) => {
          if (s.kind === 'text' && s.key) init[s.key] = '';
        });
        setV(init);
        if ((t.layout.sections || []).some((s)=>s.kind === 'table')) {
          setRows([{ _id: uid() }]);
        }
      }
    } else if (js) {
      setLegacy(js);
      if (!docId && js.text?.default) setV({ [js.text.k]: js.text.default });
    } else {
      setErr('هذا النموذج غير معروف.');
    }

    const [employeeResult, projectResult] = await Promise.all([
      supabase.from('employees')
        .select('id, employee_no, full_name_ar, person_kind, board_role, job_title, department, id_number, hire_date, mobile, basic_salary, housing_allowance, transport_allowance, other_allowance')
        .order('employee_no'),
      supabase.from('projects').select('*').order('project_no'),
    ]);
    setEmps(employeeResult.data || []);
    setProjects(projectResult.data || []);
  }, [code, docId]);

  useEffect(() => { load(); }, [load]);

  const computed = useMemo(() => {
    if (!tpl) return { payload: v, rows };
    return applyLogic(v, rows, tpl.logic || []);
  }, [tpl, v, rows]);

  const set = (k) => (e) => {
    setV({ ...v, [k]: e.target.value });
    setDirty(true);
  };

  const setRow = (id, k, val) => {
    setRows(rows.map((r)=>r._id===id ? {...r,[k]:val} : r));
    setDirty(true);
  };

  const addRow = () => {
    setRows([...rows, { _id: uid() }]);
    setDirty(true);
  };

  const delRow = (id) => {
    setRows(rows.filter((r)=>r._id!==id));
    setDirty(true);
  };

  function pickEmployee(e) {
    const emp = emps.find((x)=>x.id===e.target.value);
    setEmployeeId(e.target.value);
    if (!emp) { setDirty(true); return; }
    const allow = Number(emp.housing_allowance||0) + Number(emp.transport_allowance||0)
      + Number(emp.other_allowance||0);

    setV({
      ...v,
      employee_name: emp.full_name_ar,
      employee_no: emp.employee_no,
      job_title: emp.job_title || '',
      department: emp.department || v.department || '',
      current_title: emp.job_title || '',
      id_number: emp.id_number || '',
      hire_date: emp.hire_date || '',
      sender_name: v.sender_name || emp.full_name_ar,
      sender_title: v.sender_title || emp.job_title || '',
      sender_id: v.sender_id || emp.id_number || '',
      sender_mobile: v.sender_mobile || emp.mobile || '',
      basic_salary: emp.basic_salary || '',
      current_salary: emp.basic_salary || '',
      last_wage: Number(emp.basic_salary||0) + allow,
      allowances: allow,
      gross: Number(emp.basic_salary||0) + allow,
      housing: emp.housing_allowance || '',
      transport: emp.transport_allowance || '',
      _employee_id: emp.id,
    });
    setDirty(true);
  }

  function pickProject(e) {
    const selectedId = e.target.value;
    const project = projects.find((x)=>x.id === selectedId);
    setProjectId(selectedId);
    if (!project) { setDirty(true); return; }
    setV({
      ...v,
      project_name: project.name_ar || '',
      project_no: project.project_no || '',
      site_location: project.site_address || project.location || project.city || '',
      client_name: project.client_name || project.customer_name || v.client_name || '',
    });
    setDirty(true);
  }

  function changeIssuer(id) {
    setIssuerEmployeeId(id);
    if (!signatoryEmployeeId) setSignatoryEmployeeId(id);
    setDirty(true);
  }

  async function saveDraft(silent) {
    setErr('');
    const meta = tpl || legacy;
    if (!meta) return null;

    const payload = tpl
      ? { ...computed.payload, _rows: computed.rows }
      : { ...v };
    const employee_id = employeeId || payload._employee_id || null;
    delete payload._employee_id;

    const name = tpl ? tpl.name_ar : legacy.name;
    const who = payload.letter_title || payload.employee_name || payload.candidate_name
      || payload.project_name || payload.party_name || payload.name || payload.contractor || '';
    const subject = payload.letter_title || (name + (who ? ' - ' + who : ''));

    const documentData = {
      payload,
      language: lang,
      subject,
      employee_id,
      project_id: projectId || null,
      parties: parties || {},
      issuer_employee_id: issuerEmployeeId || null,
      signatory_employee_id: signatoryEmployeeId || null,
    };

    if (doc) {
      const { error } = await supabase.from('documents')
        .update(documentData).eq('id', doc.id);
      if (error) {
        setErr('تعذّر الحفظ: ' + error.message);
        return null;
      }
      setDirty(false);
      if (!silent) flash('حفظت المسودة');
      return doc.id;
    }

    const { data, error } = await supabase.from('documents').insert({
      doc_number: 'DRAFT-' + uid().toUpperCase(),
      template_code: tpl ? tpl.code : legacy.code,
      status: 'draft',
      ...documentData,
    }).select('*').single();

    if (error) {
      setErr(error.message.includes('row-level security')
        ? 'تعذّر إنشاء المستند وفق إعدادات الوصول الحالية.'
        : 'تعذّر الحفظ: ' + error.message);
      return null;
    }

    setDoc(data);
    setDirty(false);
    if (!silent) flash('حفظت المسودة');
    router.replace(`/dashboard/documents/edit/${data.id}`);
    return data.id;
  }

  async function preview() {
    setBusy(true);
    const id = await saveDraft(true);
    setBusy(false);
    if (id) window.open(`/print/${id}`, '_blank');
  }

  async function issue() {
    setBusy(true);
    setErr('');
    const id = await saveDraft(true);
    if (!id) {
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.rpc('issue_document_manual', {
      p_id: id,
      p_issuer_employee_id: issuerEmployeeId || null,
      p_signatory_employee_id: signatoryEmployeeId || null,
      p_issue_method: 'manual',
    });

    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }

    flash('صدر المستند برقم ' + data);
    load();
    window.open(`/print/${id}`, '_blank');
  }

  async function revert() {
    const reason = window.prompt('سبب إعادة المستند لمسودة:');
    if (reason === null) return;
    const { error } = await supabase.rpc('revert_to_draft', {
      p_id: doc.id,
      p_reason: reason,
    });
    if (error) setErr(error.message);
    else {
      flash('أعيد المستند لمسودة');
      load();
    }
  }

  if (err && !tpl && !legacy) return <div className="msg err">{err}</div>;
  if (!tpl && !legacy) return <div className="empty">جارٍ التحميل…</div>;

  const title = tpl ? tpl.name_ar : legacy.name;
  const isIssued = !!doc?.issued_at;
  const fillFields = tpl?.layout?.fill_fields || [];
  const relationScope = tpl?.relation_scope || [];
  const wantsEmployee = !!legacy || relationScope.includes('employee');
  const wantsProject = relationScope.includes('project');
  const formGridSpan = (field) => {
    const columns = Number(tpl?.layout?.gridColumns || 12);
    const perFormColumn = columns / 3;
    return Math.min(3, Math.max(1, Math.round(Number(field?.span || perFormColumn) / perFormColumn)));
  };

  const inputFor = (f, value, onChange) => (
    f.type === 'select' ? (
      <select value={value || ''} onChange={onChange} required={f.required} disabled={isIssued}>
        <option value="">اختر</option>
        {(f.options || []).map((o)=><option key={o} value={o}>{o}</option>)}
      </select>
    ) : f.rows || f.type === 'textarea' ? (
      <textarea rows={f.rows || 3} value={value ?? ''} onChange={onChange} disabled={isIssued} />
    ) : (
      <input
        type={['money','number'].includes(f.type) ? 'number' : f.type === 'date' ? 'date' : 'text'}
        step={f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined}
        dir={['money','number','date'].includes(f.type) ? 'ltr' : undefined}
        required={f.required}
        value={value ?? ''}
        onChange={onChange}
        readOnly={f.computed}
        disabled={isIssued}
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
                : <>مسودة قابلة للتعديل والمعاينة قبل الإصدار</>
            ) : 'مسودة جديدة - احفظها لتعاينها'}
            {dirty && <span style={{color:'var(--warn)'}}> - تغييرات غير محفوظة</span>}
          </p>
        </div>
        <Link className="btn ghost" href="/dashboard/documents">كل المستندات</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {isIssued && (
        <div className="msg err" style={{marginBottom:14}}>
          هذا المستند صادر برقم نهائي فلا يعدل. لتعديله أعده لمسودة أو أنشئ نسخة جديدة.
        </div>
      )}

      <div className="section" style={{marginTop:0}}>
        <header><h2>بيانات الإصدار</h2></header>
        <div style={{padding:18}}>
          <div style={{
            marginBottom:16,
            padding:'11px 13px',
            border:'1px solid var(--line)',
            borderRadius:8,
            color:'var(--ink-soft)',
            fontSize:13,
            lineHeight:1.8,
          }}>
            مستخدم البرنامج يسجل الإصدار فقط. اختر الشخص الذي صدر عنه المستند والشخص الذي يوقعه فعليًا إن كان المستند مرتبطًا بشخص محدد.
          </div>
          <div className="form-grid">
            <div className="field">
              <label>صدر عن</label>
              <select
                value={issuerEmployeeId}
                disabled={isIssued}
                onChange={(e)=>changeIssuer(e.target.value)}
              >
                <option value="">المنشأة دون شخص محدد</option>
                {emps.map((person)=>(
                  <option key={person.id} value={person.id}>{personLabel(person)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>الموقع</label>
              <select
                value={signatoryEmployeeId}
                disabled={isIssued}
                onChange={(e)=>{setSignatoryEmployeeId(e.target.value);setDirty(true);}}
              >
                <option value="">لا يوجد موقع محدد</option>
                {emps.map((person)=>(
                  <option key={person.id} value={person.id}>{personLabel(person)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

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
          لا يحجز رقم المستند إلا عند الإصدار النهائي
        </span>
      </div>

      <div className="section" style={{marginTop:0,padding:18}}>
        <div className="form-grid">
          <div className="field">
            <label>لغة المستند</label>
            <select
              value={lang}
              onChange={(e)=>{setLang(e.target.value);setDirty(true);}}
              disabled={isIssued}
            >
              <option value="ar">عربي</option>
              <option value="en">English</option>
            </select>
          </div>
          {wantsEmployee && emps.length > 0 && (
            <div className="field">
              <label>تعبئة سريعة من ملف موظف</label>
              <select onChange={pickEmployee} value={employeeId} disabled={isIssued}>
                <option value="">بدون ربط بموظف</option>
                {emps.map((e)=>(
                  <option key={e.id} value={e.id}>{e.employee_no} - {e.full_name_ar}</option>
                ))}
              </select>
            </div>
          )}
          {wantsProject && projects.length > 0 && (
            <div className="field">
              <label>تعبئة سريعة من المشروع</label>
              <select onChange={pickProject} value={projectId} disabled={isIssued}>
                <option value="">بدون ربط بمشروع</option>
                {projects.map((project)=>(
                  <option key={project.id} value={project.id}>{project.project_no} - {project.name_ar}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {fillFields.length > 0 && (
        <div className="section">
          <header><h2>بيانات المستند</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              {fillFields.map((f)=>(
                <div
                  className="field"
                  key={f.key}
                  style={{gridColumn:`span ${formGridSpan(f)}`}}
                >
                  <label>{f.label}{f.required ? ' *' : ''}</label>
                  {inputFor(f, computed.payload[f.key], set(f.key))}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tpl && (tpl.layout.sections || []).map((s) => (
        <div className="section" key={s.id}>
          <header>
            <h2>{s.title || (s.kind === 'letterhead' ? 'ترويسة الخطاب'
              : s.kind === 'stampbox' ? 'الختم والتوقيع'
              : s.kind === 'parties' ? 'بطاقات الأطراف' : '')}</h2>
          </header>

          {(s.kind === 'cards' || s.kind === 'totals') && (
            <div style={{padding:18}}>
              <div className="form-grid">
                {(s.fields || []).map((f)=>(
                  <div
                    className="field"
                    key={f.key}
                    style={{gridColumn:`span ${formGridSpan(f)}`}}
                  >
                    <label>{f.label}{f.required ? ' *' : ''}{f.computed ? ' (محسوب)' : ''}</label>
                    {inputFor(f, computed.payload[f.key], set(f.key))}
                  </div>
                ))}
                {(s.fields || []).length === 0 && (
                  <span style={{color:'var(--ink-soft)',fontSize:13.5}}>لا توجد حقول.</span>
                )}
              </div>
            </div>
          )}

          {s.kind === 'table' && (
            <>
              {!isIssued && (
                <div style={{padding:'12px 18px'}}>
                  <button type="button" className="btn ghost" onClick={addRow}>إضافة سطر</button>
                </div>
              )}
              <div style={{overflowX:'auto'}}>
                <table>
                  <thead>
                    <tr>
                      <th style={{width:40}}>م</th>
                      {(s.columns || []).map((c)=><th key={c.key}>{c.label}</th>)}
                      {!isIssued && <th style={{width:60}}>إجراء</th>}
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
                                  onChange={(e)=>setRow(
                                    r._id,
                                    c.key,
                                    ['money','number'].includes(c.type)
                                      ? Number(e.target.value||0)
                                      : e.target.value
                                  )}
                                  style={{
                                    width:'100%',
                                    border:'1px solid var(--hair)',
                                    padding:'4px 6px',
                                    fontFamily:'inherit',
                                    fontSize:13.5,
                                  }}
                                />}
                          </td>
                        ))}
                        {!isIssued && (
                          <td>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{padding:'3px 8px',fontSize:12}}
                              onClick={()=>delRow(r._id)}
                            >
                              حذف
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {computed.rows.length === 0 && (
                      <tr>
                        <td colSpan={(s.columns||[]).length + 2}>
                          <div className="empty"><h3>لا توجد أسطر</h3><p>أضف سطرًا للمتابعة.</p></div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {s.kind === 'text' && (
            <div style={{padding:18}}>
              <textarea
                rows={s.style === 'plain' ? 12 : 4}
                style={{width:'100%'}}
                value={v[s.key] || ''}
                onChange={set(s.key)}
                disabled={isIssued}
              />
            </div>
          )}

          {s.kind === 'parties' && (
            <div style={{padding:18}}>
              <PartiesEditor
                value={parties}
                disabled={isIssued}
                onChange={(value)=>{ setParties(value); setDirty(true); }}
              />
            </div>
          )}

          {(s.kind === 'letterhead' || s.kind === 'stampbox') && (
            <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)'}}>
              {s.kind === 'letterhead'
                ? 'يبنى من بيانات المستند أعلاه مع المحافظة على المحاذاة والهوامش المعتمدة.'
                : 'موضع الختم والتوقيع يعتمد على إعدادات القالب والمطبوع.'}
            </div>
          )}

          {s.kind === 'signatures' && (
            <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)'}}>
              أعمدة التواقيع: {(s.roles||[]).join(' - ')}
            </div>
          )}
        </div>
      ))}

      {tpl && tpl.parties_layout && tpl.parties_layout !== 'none'
        && !(tpl.layout.sections || []).some((x)=>x.kind === 'parties') && (
        <div className="section">
          <header><h2>بطاقات الأطراف</h2></header>
          <div style={{padding:18}}>
            <PartiesEditor
              value={parties}
              disabled={isIssued}
              onChange={(value)=>{ setParties(value); setDirty(true); }}
            />
          </div>
        </div>
      )}

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
                      <select
                        required={f.required}
                        value={v[f.k] || ''}
                        onChange={set(f.k)}
                        disabled={isIssued}
                      >
                        <option value="">اختر</option>
                        {f.options.map((o)=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type || 'text'}
                        required={f.required}
                        dir={f.type === 'date' || f.type === 'number' ? 'ltr' : undefined}
                        step={f.type === 'number' ? 'any' : undefined}
                        value={v[f.k] || ''}
                        onChange={set(f.k)}
                        disabled={isIssued}
                      />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
            {legacy.text && (
              <fieldset>
                <legend>{legacy.text.label}</legend>
                <textarea
                  rows={legacy.text.rows || 4}
                  style={{width:'100%'}}
                  value={v[legacy.text.k] || ''}
                  onChange={set(legacy.text.k)}
                  disabled={isIssued}
                />
              </fieldset>
            )}
          </div>
        </div>
      )}
    </>
  );
}
