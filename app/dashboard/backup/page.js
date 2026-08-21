'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const TABLES = [
  ['app_settings','إعدادات الشركة'],
  ['app_users','مستخدمي النظام وصلاحياتهم'],
  ['employees','الموظفون'],
  ['employment_contracts','عقود العمل'],
  ['employee_documents','مستندات الموظفين'],
  ['leave_requests','طلبات الإجازة'],
  ['leave_balances','أرصدة الإجازات'],
  ['advances','السلف'],
  ['advance_installments','أقساط السلف'],
  ['disciplinary_actions','الجزاءات'],
  ['payroll_runs','مسيّرات الرواتب'],
  ['payroll_lines','بنود المسيّرات'],
  ['end_of_service','نهاية الخدمة'],
  ['custodies','العهد'],
  ['custody_transactions','حركات العهد'],
  ['projects','المشاريع'],
  ['entities','الجهات'],
  ['work_items','دليل البنود'],
  ['quotations','عروض الأسعار'],
  ['quotation_lines','أسطر العروض'],
  ['quotation_payments','دفعات العروض'],
  ['documents','المستندات الصادرة'],
  ['correspondence_register','الصادر والوارد'],
  ['approvals','سجل الاعتمادات'],
  ['attachments','مراجع المرفقات'],
  ['notifications','التنبيهات'],
  ['audit_log','سجل التدقيق الكامل'],
  ['number_sequences','تسلسلات الأرقام'],
  ['document_templates','قوالب المستندات'],
  ['quote_presets','إعدادات عروض الأسعار'],
  ['contractors','المقاولون'],
  ['project_items','بنود المشاريع'],
  ['item_execution','إسنادات تنفيذ البنود'],
  ['progress_entries','حركات الإنجاز'],
  ['change_orders','أوامر التغيير'],
  ['progress_claims','المستخلصات'],
  ['claim_lines','بنود المستخلصات'],
  ['retentions','المحتجزات'],
  ['guarantees','الضمانات'],
  ['site_documents','مستندات الموقع'],
  ['project_materials','مواد المشاريع'],
  ['contractor_expenses','مصروفات المقاولين'],
  ['contractor_advances','سلف المقاولين'],
  ['contractor_payments','دفعات المقاولين'],
  ['project_contractors','مقاولو المشاريع'],
  ['laborers','العمالة'],
  ['labor_project_assignments','إسنادات العمالة التاريخية'],
  ['timesheet_weeks','أسابيع التايم شيت'],
  ['timesheet_days','أيام التشغيل'],
  ['day_items','إنجازات الأيام'],
  ['attendance','الحضور'],
  ['day_expenses','مصروفات الأيام'],
  ['contractor_settlements','تصفيات المقاولين'],
  ['contractor_advance_deductions','خصومات سلف المقاولين'],
  ['item_budgets','ميزانيات البنود'],
  ['budget_lines','أسطر الميزانية'],
  ['help_guides','أدلة المساعدة'],
  ['op_attachments','مرفقات العمليات'],
  ['claim_stage_defs','مراحل المستخلص'],
  ['claim_stage_docs','مستندات مراحل المستخلص'],
  ['org_classifications','تصنيفات الهيكل'],
  ['org_positions','المناصب التنظيمية'],
  ['org_job_titles','المسميات الوظيفية'],
  ['org_position_job_titles','ربط المناصب بالمسميات'],
  ['leave_balance_adjustments','تسويات رصيد الإجازات'],
  ['leave_request_substitutes','بدلاء الإجازات'],
  ['item_measurements','التمتير'],
  ['job_vacancies','الشواغر'],
  ['vacancy_requirements','متطلبات الشواغر'],
  ['candidates','المرشحون'],
  ['candidate_applications','طلبات التوظيف'],
  ['candidate_application_answers','إجابات المرشحين'],
  ['candidate_documents','مستندات المرشحين'],
  ['candidate_recommendations','توصيات المرشحين'],
  ['candidate_interview_reviews','تقييمات المقابلات'],
  ['job_offers','العروض الوظيفية'],
  ['employment_contract_drafts','مسودات عقود العمل'],
  ['candidate_onboarding','ملفات التهيئة'],
  ['candidate_onboarding_tasks','مهام التهيئة'],
  ['candidate_probation_reviews','تقييمات فترة التجربة'],
  ['workflow_action_defs','تعريفات إجراءات الاعتماد'],
  ['print_layout_overrides','تعديلات تخطيط المطبوعات'],
  ['operation_entry_batches','دفعات إدخال الأوراق'],
  ['operation_write_receipts','إثباتات الحفظ التشغيلي'],
];

const BACKUP_SCHEMA_VERSION='arkan-data-export-v2-2026-08-20';
const PAGE_SIZE=1000;

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\uFEFF' + cols.join(',') + '\n'
       + rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
}

function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [role, setRole] = useState(null);
  const [last, setLast] = useState(null);

  useEffect(() => {
    (async () => {
      const sess = (await supabase.auth.getSession()).data.session;
      const { data: u } = await supabase.from('app_users').select('role')
        .eq('id', sess?.user?.id).maybeSingle();
      setRole(u?.role || null);

      const out = {};
      const results=await Promise.all(TABLES.map(async([t])=>{
        const {count,error}=await supabase.from(t).select('*',{count:'exact',head:true});
        return [t,error?null:(count??0)];
      }));
      for(const [t,count] of results)out[t]=count;
      setCounts(out);
      setLast(localStorage?.getItem?.('arkan_last_backup') || null);
    })();
  }, []);

  async function fetchTableFully(t) {
    const {count,error:countError}=await supabase.from(t).select('*',{count:'exact',head:true});
    if(countError)throw new Error(`${t}: ${countError.message}`);
    const rows=[];
    for(let from=0;from<(count||0);from+=PAGE_SIZE){
      const {data,error}=await supabase.from(t).select('*').range(from,from+PAGE_SIZE-1);
      if(error)throw new Error(`${t}: ${error.message}`);
      rows.push(...(data||[]));
    }
    if(rows.length!==(count||0))throw new Error(`${t}: تم جلب ${rows.length} من أصل ${count||0} سجلاً`);
    return rows;
  }

  async function fetchAll() {
    const bundle = {
      schema_version:BACKUP_SCHEMA_VERSION,
      exported_at:new Date().toISOString(),
      verification:{status:'count_matched',table_count:TABLES.length,row_count:0},
      manifest:{},
      tables:{},
    };
    for (const [t,label] of TABLES) {
      const rows=await fetchTableFully(t);
      bundle.tables[t]=rows;
      bundle.manifest[t]={label,row_count:rows.length};
      bundle.verification.row_count+=rows.length;
    }
    return bundle;
  }

  async function exportJson() {
    setErr(''); setMsg(''); setBusy('json');
    try {
      const b = await fetchAll();
      const stamp = new Date().toISOString().slice(0,10);
      download(`نسخة-أركان-${stamp}.json`, JSON.stringify(b, null, 1), 'application/json');
      try { localStorage.setItem('arkan_last_backup', new Date().toISOString()); } catch {}
      setLast(new Date().toISOString());
      setMsg(`نُزّلت نسخة بيانات متحققة: ${b.verification.row_count} سجلاً، وتطابق عدد الصفوف في كل جدول.`);
    } catch (e) { setErr('تعذّر التصدير: ' + e.message); }
    setBusy('');
  }

  async function exportCsv() {
    setErr(''); setMsg(''); setBusy('csv');
    try {
      const b = await fetchAll();
      for (const [t, label] of TABLES) {
        const rows = b.tables[t];
        if (!rows?.length) continue;
        download(`${label}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
        await new Promise((r) => setTimeout(r, 220));
      }
      setMsg('نُزّلت ملفات CSV — تُفتح مباشرة في إكسل');
    } catch (e) { setErr('تعذّر التصدير: ' + e.message); }
    setBusy('');
  }

  async function exportTable(t, label) {
    setErr(''); setBusy(t);
    let data;
    try{data=await fetchTableFully(t);}catch(error){setBusy('');setErr(error.message);return;}
    setBusy('');
    if (!data?.length) { setErr('لا بيانات في هذا الجدول'); return; }
    download(`${label}.csv`, toCSV(data), 'text/csv;charset=utf-8');
  }

  const total = Object.values(counts).reduce((a,b)=>a+b, 0);
  const lastDays = last ? Math.floor((Date.now() - new Date(last).getTime())/86400000) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النسخ الاحتياطي والتصدير</h1>
          <p>تصدير مستقل متحقق من عدد الصفوف — حماية إضافية بجانب نسخة قاعدة البيانات المُدارة</p>
        </div>
        <button className="btn" onClick={exportJson} disabled={busy==='json'}>
          {busy==='json' ? 'جارٍ التحضير…' : 'تنزيل نسخة كاملة'}
        </button>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="grid k4" style={{marginBottom:20}}>
        <div className="card">
          <h3>إجمالي السجلات</h3>
          <div className="big">{total}</div>
          <div className="foot">في {TABLES.length} جدول أعمال فعلياً</div>
        </div>
        <div className="card">
          <h3>آخر نسخة نزّلتها</h3>
          <div className="big" style={{fontSize:20,paddingTop:10}}>
            {last ? dateAr(last) : 'لا شيء'}
          </div>
          <div className="foot">
            {lastDays === null ? 'لم تُنزِّل نسخة بعد'
              : lastDays === 0 ? 'اليوم' : `قبل ${lastDays} يوماً`}
          </div>
        </div>
        <div className="card">
          <h3>الموظفون</h3>
          <div className="big">{counts.employees ?? 0}</div>
        </div>
        <div className="card">
          <h3>عروض الأسعار</h3>
          <div className="big">{counts.quotations ?? 0}</div>
        </div>
      </div>

      {lastDays !== null && lastDays > 7 && (
        <div className="msg err" style={{marginBottom:16}}>
          مضى {lastDays} يوماً على آخر نسخة احتياطية. نزّل نسخة الآن.
        </div>
      )}

      <div className="section" style={{marginTop:0}}>
        <header><h2>طرق التصدير</h2></header>
        <div style={{padding:18,display:'grid',gap:14}}>
          <div style={{border:'1px solid var(--hair)',padding:14}}>
            <div style={{fontWeight:600,color:'var(--maroon-dark)',marginBottom:4}}>
              نسخة بيانات متحققة (JSON)
            </div>
            <div style={{fontSize:13.5,color:'var(--ink-soft)',marginBottom:10}}>
              ملف واحد يحوي بيانات الجداول وعلاقاتها، ومعه بيان بعدد الصفوف في كل جدول.
              لا يعلن النظام نجاحه إذا جلب جزءاً فقط من جدول كبير. احفظه في مكان مستقل.
            </div>
            <button className="btn" onClick={exportJson} disabled={busy==='json'}>
              {busy==='json' ? 'جارٍ…' : 'تنزيل'}
            </button>
          </div>

          <div style={{border:'1px solid var(--hair)',padding:14}}>
            <div style={{fontWeight:600,color:'var(--maroon-dark)',marginBottom:4}}>
              ملفات إكسل (CSV)
            </div>
            <div style={{fontSize:13.5,color:'var(--ink-soft)',marginBottom:10}}>
              ملف لكل جدول يُفتح في إكسل مباشرة — للمراجعة والتحليل والطباعة، لا للاستعادة.
            </div>
            <button className="btn ghost" onClick={exportCsv} disabled={busy==='csv'}>
              {busy==='csv' ? 'جارٍ…' : 'تنزيل كل الجداول'}
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>الجداول</h2></header>
        <table>
          <thead>
            <tr><th>الجدول</th><th className="num">عدد السجلات</th><th>تصدير</th></tr>
          </thead>
          <tbody>
            {TABLES.map(([t,label]) => (
              <tr key={t}>
                <td>{label}</td>
                <td className="num">{counts[t] ?? '—'}</td>
                <td>
                  <button className="btn ghost" style={{padding:'4px 10px',fontSize:13}}
                          disabled={busy===t || !counts[t]}
                          onClick={()=>exportTable(t,label)}>CSV</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <header><h2>الاستعادة</h2></header>
        <div style={{padding:18,fontSize:13.5,color:'var(--ink-soft)',lineHeight:1.9}}>
          هذا الملف تصدير مستقل للبيانات، وليس بديلاً عن نسخة PostgreSQL مُدارة ومجربة الاستعادة.
          الاستعادة قد تكتب فوق البيانات الحالية، لذلك لم أجعلها بضغطة واحدة. عند الحاجة يُفحص
          بيان الجداول وعدد الصفوف أولاً، ثم تُستعاد إلى بيئة منفصلة ويُجرى التطابق قبل أي رجوع للإنتاج.
          <div style={{marginTop:10,color:'var(--warn)'}}>
            تنبيه: التصدير يحفظ بيانات المرفقات ومساراتها، لكنه لا ينزّل محتوى الملفات المخزنة نفسه.
          </div>
          {role === 'ceo' && (
            <div style={{marginTop:12,color:'var(--maroon-dark)'}}>
              قاعدة التشغيل الحالية على الخطة المجانية. هذه الشاشة نسخة بيانات إضافية، ولا يجوز اعتبارها
              دليلاً على وجود نسخ تلقائية أو نجاح الاستعادة حتى نختبر ذلك بشكل مستقل.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
