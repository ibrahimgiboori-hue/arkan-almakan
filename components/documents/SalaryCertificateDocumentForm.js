'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { composeSalaryCertificate, salaryFacts } from '@/lib/document-automation-policy';

const DEFAULT_RECIPIENT = 'إلى من يهمه الأمر';

function money(value) {
  return Number(value || 0).toLocaleString('ar-SA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function SalaryCertificateDocumentForm({ docId = null }) {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [doc, setDoc] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT);
  const [body, setBody] = useState('');
  const [issuerEmployeeId, setIssuerEmployeeId] = useState('');
  const [signatoryEmployeeId, setSignatoryEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const jobs = [
        supabase.from('employees')
          .select('id,employee_no,full_name_ar,full_name_en,status,job_title,department,id_number,hire_date,basic_salary,housing_allowance,transport_allowance,other_allowance')
          .order('employee_no'),
        supabase.from('app_settings').select('company_name_ar').eq('id', 1).maybeSingle(),
      ];
      if (docId) {
        jobs.push(supabase.from('documents').select('*').eq('id', docId).maybeSingle());
      }
      const [employeeQ, settingsQ, docQ] = await Promise.all(jobs);
      if (!active) return;
      setEmployees(employeeQ.data || []);
      setCompanyName(settingsQ.data?.company_name_ar || 'أركان المكان للمقاولات');

      if (docId && docQ?.data) {
        setDoc(docQ.data);
        setEmployeeId(docQ.data.employee_id || '');
        setIssuerEmployeeId(docQ.data.issuer_employee_id || '');
        setSignatoryEmployeeId(docQ.data.signatory_employee_id || '');
        const payload = docQ.data.payload || {};
        setRecipient(payload.recipient || DEFAULT_RECIPIENT);
        setBody(payload.certificate_text || '');
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [docId]);

  const employee = useMemo(
    () => employees.find((row) => row.id === employeeId) || null,
    [employees, employeeId],
  );

  const generated = useMemo(
    () => composeSalaryCertificate(employee, companyName, recipient),
    [employee, companyName, recipient],
  );

  const facts = useMemo(() => salaryFacts(employee), [employee]);
  const isIssued = !!doc?.issued_at;

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 1800);
  }

  function chooseEmployee(id) {
    setEmployeeId(id);
    const selected = employees.find((row) => row.id === id) || null;
    const next = composeSalaryCertificate(selected, companyName, recipient);
    setBody(next.body || '');
    setErr(next.error || '');
    setDirty(true);
  }

  function changeRecipient(value) {
    setRecipient(value);
    const next = composeSalaryCertificate(employee, companyName, value);
    if (!next.error) setBody(next.body);
    setDirty(true);
  }

  function regenerateText() {
    if (generated.error) {
      setErr(generated.error);
      return;
    }
    setBody(generated.body);
    setDirty(true);
    flash('أعيد توليد النص من البيانات المسجلة');
  }

  function payloadForSave() {
    if (!employee) return null;
    const built = composeSalaryCertificate(employee, companyName, recipient);
    if (built.error) throw new Error(built.error);
    return {
      ...built.payload,
      certificate_text: body || built.body,
      _autofill: {
        employee_id: employee.id,
        source: 'salary_certificate_automatic',
        policy_version: '1.0',
        last_filled_at: new Date().toISOString(),
      },
    };
  }

  async function saveDraft(silent = false) {
    setErr('');
    if (!employeeId) {
      setErr('اختر الموظف أولًا.');
      return null;
    }
    let payload;
    try {
      payload = payloadForSave();
    } catch (error) {
      setErr(error.message || String(error));
      return null;
    }

    const data = {
      template_code: 'SALARY_CERT',
      language: 'ar',
      subject: `تعريف بالراتب - ${employee.full_name_ar}`,
      employee_id: employee.id,
      payload,
      status: doc?.status || 'draft',
      parties: doc?.parties || {},
      issuer_employee_id: issuerEmployeeId || null,
      signatory_employee_id: signatoryEmployeeId || null,
    };

    if (doc?.id) {
      const q = await supabase.from('documents').update(data).eq('id', doc.id).select('*').single();
      if (q.error) {
        setErr('تعذر حفظ تعريف الراتب: ' + q.error.message);
        return null;
      }
      setDoc(q.data);
      setDirty(false);
      if (!silent) flash('حُفظ تعريف الراتب');
      return q.data.id;
    }

    const q = await supabase.from('documents').insert({
      ...data,
      doc_number: `DRAFT-SAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    }).select('*').single();
    if (q.error) {
      setErr('تعذر إنشاء تعريف الراتب: ' + q.error.message);
      return null;
    }
    setDoc(q.data);
    setDirty(false);
    router.replace(`/dashboard/documents/edit/${q.data.id}`);
    if (!silent) flash('أُنشئت مسودة تعريف الراتب');
    return q.data.id;
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
    const q = await supabase.rpc('issue_document_manual', {
      p_id: id,
      p_issuer_employee_id: issuerEmployeeId || null,
      p_signatory_employee_id: signatoryEmployeeId || null,
      p_issue_method: 'manual',
    });
    setBusy(false);
    if (q.error) {
      setErr(q.error.message);
      return;
    }
    flash('صدر تعريف الراتب برقم ' + q.data);
    window.open(`/print/${id}`, '_blank');
    setTimeout(() => window.location.reload(), 500);
  }

  async function revert() {
    if (!doc?.id) return;
    const reason = window.prompt('سبب إعادة المستند لمسودة:');
    if (reason === null) return;
    const q = await supabase.rpc('revert_to_draft', { p_id: doc.id, p_reason: reason });
    if (q.error) setErr(q.error.message);
    else window.location.reload();
  }

  if (loading) return <div className="empty">جارٍ تحميل بيانات تعريف الراتب…</div>;

  return <>
    <div className="page-head">
      <div>
        <h1>تعريف بالراتب</h1>
        <p>اختر الموظف، ويُنشئ البرنامج التعريف كاملًا من البيانات المعتمدة دون إدخال الراتب يدويًا.</p>
      </div>
      <Link className="btn ghost" href="/dashboard/documents">كل المستندات</Link>
    </div>

    {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
    {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
    {dirty && !isIssued && <div className="msg" style={{marginBottom:14}}>يوجد تعديل غير محفوظ.</div>}

    {isIssued && <div className="msg err" style={{marginBottom:14}}>
      هذا التعريف صادر برقم نهائي ولا يُعدّل مباشرة.
    </div>}

    <div className="section" style={{marginTop:0}}>
      <header><h2>إنشاء التعريف</h2></header>
      <div style={{padding:18}}>
        <div className="form-grid">
          <div className="field">
            <label>الموظف</label>
            <select value={employeeId} disabled={isIssued} onChange={(e)=>chooseEmployee(e.target.value)}>
              <option value="">اختر الموظف</option>
              {employees.map((row)=><option key={row.id} value={row.id}>{row.employee_no} - {row.full_name_ar}</option>)}
            </select>
          </div>
          <div className="field">
            <label>الجهة الموجه إليها</label>
            <input value={recipient} disabled={isIssued} onChange={(e)=>changeRecipient(e.target.value)} />
            <span className="hint">القيمة الافتراضية صالحة دون تعديل: «إلى من يهمه الأمر».</span>
          </div>
        </div>
      </div>
    </div>

    {employee && <div className="section">
      <header><h2>البيانات التي سيعتمد عليها المستند</h2></header>
      <div style={{padding:18}}>
        {generated.error ? <div className="msg err">{generated.error}</div> : <>
          <div className="cards" style={{marginBottom:16}}>
            <section className="card-doc">
              <div className="card-head">الموظف</div>
              <table><tbody>
                <tr><td className="k">الاسم</td><td className="v">{employee.full_name_ar}</td></tr>
                <tr><td className="k">الرقم الوظيفي</td><td className="v">{employee.employee_no || '—'}</td></tr>
                <tr><td className="k">المسمى الوظيفي</td><td className="v">{employee.job_title || '—'}</td></tr>
                <tr><td className="k">الهوية / الإقامة</td><td className="v">{employee.id_number || '—'}</td></tr>
              </tbody></table>
            </section>
            <section className="card-doc">
              <div className="card-head">الراتب الشهري المسجل</div>
              <table><tbody>
                {facts.hasAllowances ? <>
                  <tr><td className="k">الراتب الأساسي</td><td className="v mono">{money(facts.basic)} ريال</td></tr>
                  {facts.housing > 0 && <tr><td className="k">بدل السكن</td><td className="v mono">{money(facts.housing)} ريال</td></tr>}
                  {facts.transport > 0 && <tr><td className="k">بدل النقل</td><td className="v mono">{money(facts.transport)} ريال</td></tr>}
                  {facts.other > 0 && <tr><td className="k">بدلات أخرى</td><td className="v mono">{money(facts.other)} ريال</td></tr>}
                </> : null}
                <tr><td className="k">الإجمالي</td><td className="v mono"><strong>{money(facts.gross)} ريال</strong></td></tr>
              </tbody></table>
            </section>
          </div>

          <div className="field">
            <label>نص التعريف</label>
            <textarea rows={10} value={body || generated.body} disabled={isIssued}
              onChange={(e)=>{setBody(e.target.value);setDirty(true);}} style={{width:'100%'}} />
            {!isIssued && <div style={{marginTop:8}}>
              <button type="button" className="btn ghost" onClick={regenerateText}>إعادة توليد النص الآمن</button>
            </div>}
            <span className="hint">النص الآلي يثبت البيانات المسجلة فقط، ولا ينشئ ضمانًا أو كفالة أو التزامًا إضافيًا على المنشأة.</span>
          </div>
        </>}
      </div>
    </div>}

    <div className="section">
      <header><h2>الإصدار والتوقيع</h2></header>
      <div style={{padding:18}}>
        <div className="form-grid">
          <div className="field">
            <label>صدر عن — اختياري</label>
            <select value={issuerEmployeeId} disabled={isIssued} onChange={(e)=>{setIssuerEmployeeId(e.target.value);setDirty(true);}}>
              <option value="">المنشأة دون شخص محدد</option>
              {employees.map((row)=><option key={row.id} value={row.id}>{row.employee_no} - {row.full_name_ar}</option>)}
            </select>
          </div>
          <div className="field">
            <label>الموقع الفعلي — اختياري</label>
            <select value={signatoryEmployeeId} disabled={isIssued} onChange={(e)=>{setSignatoryEmployeeId(e.target.value);setDirty(true);}}>
              <option value="">لا يوجد موقع محدد</option>
              {employees.map((row)=><option key={row.id} value={row.id}>{row.employee_no} - {row.full_name_ar}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div className="rowsplit stickybar">
      {!isIssued ? <>
        <button className="btn ghost" disabled={busy || !!generated.error} onClick={()=>saveDraft(false)}>حفظ المسودة</button>
        <button className="btn ghost" disabled={busy || !!generated.error} onClick={preview}>حفظ ومعاينة</button>
        <button className="btn" disabled={busy || !!generated.error} onClick={issue}>إصدار نهائي</button>
      </> : <>
        <a className="btn" href={`/print/${doc.id}`} target="_blank" rel="noreferrer">فتح للطباعة</a>
        <button className="btn ghost" onClick={revert}>إعادة لمسودة للتعديل</button>
      </>}
      <span className="spacer" />
      <span className="hint">لا يُصدر تعريف راتب آلي إذا كان الراتب غير مسجل أو يساوي صفرًا.</span>
    </div>
  </>;
}
