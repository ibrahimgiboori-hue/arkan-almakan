'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { uid } from '@/lib/form-engine';
import { personLabel } from '@/lib/people';
import ProjectReportJourneyEditor from '@/components/documents/ProjectReportJourneyEditor';

const REPORT_CODE = 'PROJECT_WORK_CLAIMS_REPORT_V1';
const GENERATED_KEYS = [
  'intro','conclusion','handover',
  'executed_total','paid_total','pending_total','steel_package_total',
];

const todayRiyadh = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Riyadh', year:'numeric', month:'2-digit', day:'2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0,10);
  }
};

const normalizeSections = (payload) => {
  if (Array.isArray(payload?._report_sections)) return payload._report_sections;
  if (String(payload?.handover || '').trim()) {
    return [{ id:'legacy-handover', title:'تسليم مسؤولية الموقع قبل الإجازة', text:payload.handover }];
  }
  return [];
};

export default function ProjectReportDocumentForm({ docId = null }) {
  const router = useRouter();
  const [tpl, setTpl] = useState(null);
  const [doc, setDoc] = useState(null);
  const [v, setV] = useState({ report_date:todayRiyadh() });
  const [rows, setRows] = useState([{ _id:uid(), operational_lines:[] }]);
  const [reportSections, setReportSections] = useState([]);
  const [projects, setProjects] = useState([]);
  const [emps, setEmps] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [issuerEmployeeId, setIssuerEmployeeId] = useState('');
  const [signatoryEmployeeId, setSignatoryEmployeeId] = useState('');
  const [lang, setLang] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (value) => { setMsg(value); setTimeout(()=>setMsg(''), 1600); };

  const load = useCallback(async () => {
    setErr('');
    let loadedDoc = null;
    if (docId) {
      const result = await supabase.from('documents').select('*').eq('id', docId).maybeSingle();
      if (!result.data) { setErr('لم يعثر على هذا المستند.'); return; }
      if (result.data.template_code !== REPORT_CODE) {
        setErr('هذا المستند لا يستخدم قالب تقرير متابعة الأعمال والمستخلصات.');
        return;
      }
      loadedDoc = result.data;
      setDoc(result.data);
      setLang(result.data.language || 'ar');
      setProjectId(result.data.project_id || '');
      setIssuerEmployeeId(result.data.issuer_employee_id || '');
      setSignatoryEmployeeId(result.data.signatory_employee_id || '');
      const payload = result.data.payload || {};
      setRows(Array.isArray(payload._rows) && payload._rows.length ? payload._rows : [{ _id:uid(), operational_lines:[] }]);
      setReportSections(normalizeSections(payload));
      const clean = { ...payload };
      delete clean._rows;
      delete clean._report_sections;
      setV(clean);
    }

    const [templateResult, projectResult, employeeResult] = await Promise.all([
      supabase.from('document_templates').select('*').eq('code', REPORT_CODE).maybeSingle(),
      supabase.from('projects').select('*').order('project_no'),
      supabase.from('employees')
        .select('id, employee_no, full_name_ar, person_kind, board_role, job_title')
        .order('employee_no'),
    ]);
    if (!templateResult.data) { setErr('قالب التقرير غير موجود.'); return; }
    setTpl(templateResult.data);
    setProjects(projectResult.data || []);
    setEmps(employeeResult.data || []);

    if (!loadedDoc && !v.report_date) setV({ report_date:todayRiyadh() });
  }, [docId]);

  useEffect(() => { load(); }, [load]);

  const identityFields = useMemo(() => {
    const section = (tpl?.layout?.sections || []).find((item) => item.id === 'report_identity');
    return section?.fields || [];
  }, [tpl]);

  const isIssued = !!doc?.issued_at;

  const setField = (key, value) => {
    setV((current) => ({ ...current, [key]:value }));
    setDirty(true);
  };

  const changeSections = (next) => {
    setReportSections(next);
    setDirty(true);
  };

  const changeRows = (next) => {
    setRows(next);
    setDirty(true);
  };

  const pickProject = (event) => {
    const selectedId = event.target.value;
    setProjectId(selectedId);
    const project = projects.find((item) => item.id === selectedId);
    if (project) {
      setV((current) => ({
        ...current,
        project_name_text:project.name_ar || current.project_name_text || '',
      }));
    }
    setDirty(true);
  };

  const changeIssuer = (id) => {
    setIssuerEmployeeId(id);
    if (!signatoryEmployeeId) setSignatoryEmployeeId(id);
    setDirty(true);
  };

  const cleanPayload = () => {
    const payload = { ...v, _rows:rows, _report_sections:reportSections };
    for (const key of GENERATED_KEYS) delete payload[key];
    return payload;
  };

  async function saveDraft(silent = false) {
    setErr('');
    if (!tpl) return null;
    const payload = cleanPayload();
    const subject = payload.report_subject
      || `${tpl.name_ar}${payload.project_name_text ? ` - ${payload.project_name_text}` : ''}`;
    const documentData = {
      payload,
      language:lang,
      subject,
      employee_id:null,
      project_id:projectId || null,
      parties:{},
      issuer_employee_id:issuerEmployeeId || null,
      signatory_employee_id:signatoryEmployeeId || null,
    };

    if (doc) {
      const { error } = await supabase.from('documents').update(documentData).eq('id', doc.id);
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return null; }
      setDirty(false);
      if (!silent) flash('حفظت المسودة');
      return doc.id;
    }

    const { data, error } = await supabase.from('documents').insert({
      doc_number:'DRAFT-' + uid().toUpperCase(),
      template_code:REPORT_CODE,
      status:'draft',
      ...documentData,
    }).select('*').single();
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return null; }
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
    const id = await saveDraft(true);
    if (!id) { setBusy(false); return; }
    const { data, error } = await supabase.rpc('issue_document_manual', {
      p_id:id,
      p_issuer_employee_id:issuerEmployeeId || null,
      p_signatory_employee_id:signatoryEmployeeId || null,
      p_issue_method:'manual',
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    flash('صدر المستند برقم ' + data);
    await load();
    window.open(`/print/${id}`, '_blank');
  }

  async function revert() {
    const reason = window.prompt('سبب إعادة المستند لمسودة:');
    if (reason === null) return;
    const { error } = await supabase.rpc('revert_to_draft', { p_id:doc.id, p_reason:reason });
    if (error) setErr(error.message);
    else { flash('أعيد المستند لمسودة'); load(); }
  }

  if (err && !tpl) return <div className="msg err">{err}</div>;
  if (!tpl) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tpl.name_ar}</h1>
          <p>
            {doc ? (isIssued ? <>صادر برقم <span className="mono">{doc.doc_number}</span></> : <>مسودة قابلة للتعديل والمعاينة قبل الإصدار</>) : 'مسودة جديدة'}
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

      <div className="rowsplit stickybar">
        {!isIssued ? (
          <>
            <button className="btn ghost" disabled={busy} onClick={()=>saveDraft(false)}>حفظ المسودة</button>
            <button className="btn ghost" disabled={busy} onClick={preview}>حفظ ومعاينة</button>
            <button className="btn" disabled={busy} onClick={issue}>إصدار نهائي برقم</button>
          </>
        ) : (
          <>
            <a className="btn" href={`/print/${doc.id}`} target="_blank" rel="noreferrer">فتح للطباعة</a>
            <button className="btn ghost" onClick={revert}>إعادة لمسودة للتعديل</button>
          </>
        )}
      </div>

      <div className="section" style={{marginTop:0}}>
        <header><h2>بيانات الإصدار</h2></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            <div className="field">
              <label>لغة المستند</label>
              <select value={lang} disabled={isIssued} onChange={(event)=>{setLang(event.target.value);setDirty(true);}}>
                <option value="ar">عربي</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="field">
              <label>تعبئة سريعة من المشروع</label>
              <select value={projectId} disabled={isIssued} onChange={pickProject}>
                <option value="">مشروع غير مسجل / إدخال يدوي</option>
                {projects.map((project)=><option key={project.id} value={project.id}>{project.project_no} - {project.name_ar}</option>)}
              </select>
            </div>
            <div className="field">
              <label>صدر عن</label>
              <select value={issuerEmployeeId} disabled={isIssued} onChange={(event)=>changeIssuer(event.target.value)}>
                <option value="">المنشأة دون شخص محدد</option>
                {emps.map((person)=><option key={person.id} value={person.id}>{personLabel(person)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>الموقع</label>
              <select value={signatoryEmployeeId} disabled={isIssued} onChange={(event)=>{setSignatoryEmployeeId(event.target.value);setDirty(true);}}>
                <option value="">لا يوجد موقع محدد</option>
                {emps.map((person)=><option key={person.id} value={person.id}>{personLabel(person)}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>بيانات التقرير</h2></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            {identityFields.map((field) => (
              <div className="field" key={field.key}>
                <label>{field.label}{field.required ? ' *' : ''}</label>
                <input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={v[field.key] ?? ''}
                  required={field.required}
                  disabled={isIssued}
                  onChange={(event)=>setField(field.key,event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>البنود والمتابعة</h2></header>
        <ProjectReportJourneyEditor
          rows={rows}
          setRows={changeRows}
          reportSections={reportSections}
          legacyHandover={v.handover}
          onReportSectionsChange={changeSections}
          disabled={isIssued}
        />
      </div>
    </>
  );
}
