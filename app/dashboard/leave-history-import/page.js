'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const TYPE_MAP = {
  annual: 'annual', 'سنوية': 'annual', 'إجازة سنوية': 'annual',
  sick: 'sick', 'مرضية': 'sick', 'إجازة مرضية': 'sick',
  unpaid: 'unpaid', 'بدون راتب': 'unpaid', 'إجازة بدون راتب': 'unpaid',
  permission: 'permission', 'استئذان': 'permission', 'إذن': 'permission',
  emergency: 'emergency', 'طارئة': 'emergency', 'اضطرارية': 'emergency',
  hajj: 'hajj', 'حج': 'hajj',
  maternity: 'maternity', 'أمومة': 'maternity', 'وضع': 'maternity',
};

const TYPE_AR = {
  annual:'سنوية', sick:'مرضية', unpaid:'بدون راتب', permission:'استئذان',
  emergency:'طارئة', hajj:'حج', maternity:'أمومة'
};

const HEADER_MAP = {
  'الرقم الوظيفي':'employee_no', 'employee_no':'employee_no',
  'نوع الإجازة':'leave_kind', 'leave_kind':'leave_kind',
  'من':'start_date', 'start_date':'start_date',
  'إلى':'end_date', 'الى':'end_date', 'end_date':'end_date',
  'تاريخ المباشرة بعد الإجازة':'actual_return_date', 'actual_return_date':'actual_return_date',
  'مرجع الورقة':'paper_reference', 'paper_reference':'paper_reference',
  'تاريخ المستند':'paper_document_date', 'paper_document_date':'paper_document_date',
  'المعتمد في الورقة':'paper_approver_text', 'paper_approver_text':'paper_approver_text',
  'السبب أو الملاحظات':'reason', 'الملاحظات':'reason', 'reason':'reason',
};

function detectDelimiter(line) {
  const choices = [',',';','\t'];
  return choices.sort((a,b)=>(line.split(b).length - line.split(a).length))[0];
}

function splitCsvLine(line, delimiter) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i=0; i<line.length; i+=1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(value.trim()); value = '';
    } else value += ch;
  }
  out.push(value.trim());
  return out;
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return null;
}

function isRealDate(iso) {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === iso;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

export default function LeaveHistoryImport() {
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('employees').select('employee_no, full_name_ar').order('employee_no')
      .then(({data,error}) => {
        if (error) setErr(error.message);
        else setEmployees(data || []);
      });
  }, []);

  const employeeMap = useMemo(() => new Map(employees.map(e => [String(e.employee_no || '').trim(), e])), [employees]);

  function downloadTemplate() {
    const headers = ['الرقم الوظيفي','نوع الإجازة','من','إلى','تاريخ المباشرة بعد الإجازة','مرجع الورقة','تاريخ المستند','المعتمد في الورقة','السبب أو الملاحظات'];
    const example = ['EMP-001','سنوية','01/01/2025','15/01/2025','16/01/2025','LV-2025-001','20/12/2024','اسم المعتمد كما يظهر في الورقة',''];
    const text = '\uFEFF' + headers.map(csvEscape).join(',') + '\r\n' + example.map(csvEscape).join(',') + '\r\n';
    const blob = new Blob([text], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'نموذج_استيراد_الإجازات_القديمة.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file) {
    setErr(''); setMsg(''); setRows([]); setFileName(file?.name || '');
    if (!file) return;
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(x => x.trim());
    if (lines.length < 2) { setErr('الملف لا يحتوي على حركات إجازة.'); return; }
    const delimiter = detectDelimiter(lines[0]);
    const rawHeaders = splitCsvLine(lines[0], delimiter);
    const headers = rawHeaders.map(h => HEADER_MAP[h.trim()] || null);
    const required = ['employee_no','leave_kind','start_date','end_date'];
    const missing = required.filter(k => !headers.includes(k));
    if (missing.length) {
      setErr('رؤوس الأعمدة غير مكتملة. استخدم نموذج الاستيراد المعتمد من الصفحة.');
      return;
    }

    const parsed = lines.slice(1).map((line,index) => {
      const values = splitCsvLine(line, delimiter);
      const raw = {};
      headers.forEach((key,i) => { if (key) raw[key] = values[i] ?? ''; });
      const errors = [];
      const employeeNo = String(raw.employee_no || '').trim();
      const employee = employeeMap.get(employeeNo);
      if (!employee) errors.push('الرقم الوظيفي غير موجود');
      const kindText = String(raw.leave_kind || '').trim();
      const kind = TYPE_MAP[kindText] || TYPE_MAP[kindText.toLowerCase()];
      if (!kind) errors.push('نوع الإجازة غير معروف');
      const start = normalizeDate(raw.start_date);
      const end = normalizeDate(raw.end_date);
      const actualReturn = normalizeDate(raw.actual_return_date);
      const documentDate = normalizeDate(raw.paper_document_date);
      if (!start || !isRealDate(start)) errors.push('تاريخ البداية غير صحيح');
      if (!end || !isRealDate(end)) errors.push('تاريخ النهاية غير صحيح');
      if (start && end && isRealDate(start) && isRealDate(end) && end < start) errors.push('تاريخ النهاية قبل البداية');
      if (raw.actual_return_date && (!actualReturn || !isRealDate(actualReturn))) errors.push('تاريخ المباشرة غير صحيح');
      if (raw.paper_document_date && (!documentDate || !isRealDate(documentDate))) errors.push('تاريخ المستند غير صحيح');

      return {
        row_no:index + 2,
        employee_no:employeeNo,
        employee_name:employee?.full_name_ar || '',
        leave_kind:kind || '',
        leave_kind_ar:kind ? TYPE_AR[kind] : kindText,
        start_date:start || '', end_date:end || '',
        actual_return_date:actualReturn || '',
        paper_reference:String(raw.paper_reference || '').trim(),
        paper_document_date:documentDate || '',
        paper_approver_text:String(raw.paper_approver_text || '').trim(),
        reason:String(raw.reason || '').trim(),
        errors,
      };
    });

    const seen = new Set();
    parsed.forEach(r => {
      const key = `${r.employee_no}|${r.leave_kind}|${r.start_date}|${r.end_date}|${r.paper_reference}`;
      if (seen.has(key)) r.errors.push('الحركة مكررة داخل الملف');
      seen.add(key);
    });
    setRows(parsed);
  }

  const invalidCount = rows.filter(r => r.errors.length).length;
  const validRows = rows.filter(r => !r.errors.length);

  async function importRows() {
    if (!validRows.length || invalidCount) return;
    setBusy(true); setErr(''); setMsg('');
    const payload = validRows.map(({employee_name,leave_kind_ar,row_no,errors,...r}) => r);
    const { data, error } = await supabase.rpc('import_historical_leaves', { p_rows:payload });
    setBusy(false);
    if (error) { setErr('تعذر الاستيراد: ' + error.message); return; }
    const result = data?.[0] || {};
    setMsg(`تم استيراد ${result.imported_count || 0} حركة تاريخية${Number(result.skipped_count || 0) ? `، وتم تجاوز ${result.skipped_count} حركة موجودة مسبقاً` : ''}.`);
    setRows([]); setFileName('');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>استيراد الإجازات القديمة</h1>
          <p>إدخال الحركات المثبتة في الملفات الورقية على دفعة واحدة</p>
        </div>
        <Link className="btn ghost" href="/dashboard/leaves">العودة إلى الإجازات</Link>
      </div>

      <div className="section" style={{marginTop:0}}>
        <header><h2>طريقة الاستيراد</h2></header>
        <div style={{padding:18,lineHeight:1.9,color:'var(--ink-soft)',fontSize:13.5}}>
          استخدم الرقم الوظيفي لمطابقة الموظف. يقبل التاريخ بصيغة 31/12/2025 أو 2025-12-31. الإجازات المستوردة تسجل كحركات تاريخية مكتملة ولا تدخل في دورة اعتماد جديدة. إذا كان في الملف أي سطر غير صحيح فلن يبدأ الاستيراد حتى يتم تصحيحه.
        </div>
        <div className="rowsplit" style={{padding:'0 18px 18px'}}>
          <button className="btn ghost" type="button" onClick={downloadTemplate}>تنزيل نموذج الاستيراد</button>
          <label className="btn" style={{cursor:'pointer'}}>
            اختيار ملف CSV
            <input type="file" accept=".csv,text/csv" onChange={(e)=>readFile(e.target.files?.[0])} style={{display:'none'}} />
          </label>
          {fileName && <span style={{fontSize:13,color:'var(--ink-soft)'}}>{fileName}</span>}
        </div>
      </div>

      {err && <div className="msg err" style={{marginTop:16}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginTop:16}}>{msg}</div>}

      {rows.length > 0 && (
        <div className="section">
          <header>
            <h2>مراجعة البيانات قبل الاستيراد</h2>
            <span style={{fontSize:13,color:invalidCount ? 'var(--bad)' : 'var(--ok)',fontWeight:600}}>
              {rows.length} حركة، {invalidCount ? `${invalidCount} تحتاج تصحيحاً` : 'جميع الحركات جاهزة'}
            </span>
          </header>
          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>السطر</th><th>الموظف</th><th>نوع الإجازة</th><th>من</th><th>إلى</th><th>المرجع</th><th>النتيجة</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.row_no}>
                    <td className="num">{r.row_no}</td>
                    <td>{r.employee_no}{r.employee_name ? ` - ${r.employee_name}` : ''}</td>
                    <td>{r.leave_kind_ar}</td>
                    <td className="mono">{r.start_date || 'غير صحيح'}</td>
                    <td className="mono">{r.end_date || 'غير صحيح'}</td>
                    <td>{r.paper_reference || ''}</td>
                    <td style={{color:r.errors.length ? 'var(--bad)' : 'var(--ok)',fontWeight:600}}>{r.errors.length ? r.errors.join('، ') : 'صالح للاستيراد'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:18}}>
            <button className="btn" disabled={busy || invalidCount > 0 || validRows.length === 0} onClick={importRows}>
              {busy ? 'جارٍ الاستيراد' : `استيراد ${validRows.length} حركة`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
