'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, EmptyState, Notice, Toolbar } from '@/components/ui/ConstitutionUI';
import RawGrid, { rawGridStyles } from '@/components/ui/RawGrid';
import styles from '../timesheet.module.css';

const STATUS_AR = { draft:'مسودة', reviewed:'مراجع', approved:'معتمد', closed:'مغلق' };
const WEEKDAY = ['أحد','اثن','ثلا','أرب','خمي','جمع','سبت'];
const DEFAULT_VAT_RATE = 0.15;
const PAYMENT_DETAILS = Object.freeze({ bank:'مصرف الإنماء', beneficiary:'مؤسسة أركان المكان للمقاولات العامة', iban:'SA4905000068205728542000' });
const n = (value) => Number(value || 0);
const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function attendanceTotal(attendance = {}) {
  return Object.values(attendance || {}).reduce((sum, value) => sum + n(value), 0);
}

function seededAttendance(year, month, requestedDays) {
  const count = daysInMonth(year, month);
  const target = Math.max(0, Math.min(n(requestedDays), count));
  const regular = [];
  const fridays = [];
  for (let day = 1; day <= count; day += 1) {
    const weekday = new Date(Number(year), Number(month) - 1, day).getDay();
    (weekday === 5 ? fridays : regular).push(day);
  }
  const sequence = [...regular, ...fridays];
  let remaining = target;
  const result = {};
  for (const day of sequence) {
    if (remaining <= 0) break;
    if (remaining >= 1) {
      result[String(day)] = 1;
      remaining -= 1;
    } else {
      result[String(day)] = 0.5;
      remaining = 0;
    }
  }
  return result;
}

function nextCellValue(value) {
  const current = n(value);
  if (current === 0) return 1;
  if (current === 1) return 0.5;
  return 0;
}

function money(value) {
  return Number(value || 0).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

export default function ExternalTimesheetEditor() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, sheet:null, workers:[], error:'', message:'' });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [sheetQ, workersQ] = await Promise.all([
      supabase.from('contractor_external_timesheets')
        .select('*,contractors(id,name_ar,contractor_no,worker_daily,tech_daily)')
        .eq('id', id).maybeSingle(),
      supabase.from('contractor_external_timesheet_workers').select('*').eq('timesheet_id', id).order('row_no').order('created_at'),
    ]);
    const error = sheetQ.error || workersQ.error;
    setState({ loading:false, sheet:sheetQ.data || null, workers:workersQ.data || [], error:error?.message || '', message:'' });
  }

  useEffect(() => { if (id) load(); }, [id]);

  const dayCount = state.sheet ? daysInMonth(state.sheet.period_year, state.sheet.period_month) : 31;
  const days = useMemo(() => Array.from({length:dayCount}, (_,index) => index + 1), [dayCount]);
  const totalDays = useMemo(() => state.workers.reduce((sum,row) => sum + n(row.reported_days), 0), [state.workers]);
  const claimTotal = useMemo(() => state.workers.reduce((sum,row) => {
    const rate = row.daily_rate == null || row.daily_rate === '' ? state.sheet?.default_daily_rate : row.daily_rate;
    return sum + n(row.reported_days) * n(rate);
  }, 0), [state.workers, state.sheet?.default_daily_rate]);
  const vatRate = state.sheet?.vat_rate == null || state.sheet?.vat_rate === '' ? DEFAULT_VAT_RATE : n(state.sheet.vat_rate);
  const claimVat = useMemo(() => round2(claimTotal * vatRate), [claimTotal, vatRate]);
  const claimTotalWithVat = useMemo(() => round2(claimTotal + claimVat), [claimTotal, claimVat]);

  function patchSheet(patch) {
    setState((current) => ({ ...current, sheet:{...current.sheet,...patch}, message:'' }));
  }

  function patchWorker(key, patch) {
    setState((current) => ({ ...current, workers:current.workers.map((row) => (row.id === key || row._key === key) ? {...row,...patch} : row), message:'' }));
  }

  function workerKey(row, index) { return row.id || row._key || `row-${index}`; }

  function addBlank() {
    const key = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setState((current) => ({ ...current, workers:[...current.workers,{_key:key,row_no:current.workers.length+1,worker_name:'',iqama_no:'',reported_days:0,attendance:{},daily_rate:null,notes:''}] }));
  }

  function seedRow(row, index) {
    const key = workerKey(row,index);
    const attendance = seededAttendance(state.sheet.period_year,state.sheet.period_month,row.reported_days);
    patchWorker(key,{attendance,reported_days:attendanceTotal(attendance)});
  }

  function seedAll() {
    setState((current) => ({
      ...current,
      workers:current.workers.map((row) => {
        const attendance = seededAttendance(current.sheet.period_year,current.sheet.period_month,row.reported_days);
        return {...row,attendance,reported_days:attendanceTotal(attendance)};
      }),
      message:'تم زرع الأيام لكل العمال. يمكنك تعديل أي يوم يدويًا قبل الحفظ أو الطباعة.',
    }));
  }

  function toggleDay(row, index, day) {
    const key = workerKey(row,index);
    const attendance = {...(row.attendance || {})};
    const value = nextCellValue(attendance[String(day)]);
    if (value === 0) delete attendance[String(day)];
    else attendance[String(day)] = value;
    patchWorker(key,{attendance,reported_days:attendanceTotal(attendance)});
  }

  // The month as a sheet: each day is a list cell (1 / ½ / empty) derived from row.attendance.
  const sheetRows = useMemo(() => state.workers.map((row) => {
    const out = { ...row, _rowKey: row.id || row._key };
    for (const day of days) {
      const value = n(row.attendance?.[String(day)]);
      out[`d${day}`] = value === 1 ? '1' : value === 0.5 ? '0.5' : '';
    }
    return out;
  }), [state.workers, days]);

  const dayColumns = days.map((day) => {
    const date = new Date(state.sheet?.period_year, (state.sheet?.period_month || 1) - 1, day);
    return {
      key:`d${day}`, label:`${day} ${WEEKDAY[date.getDay()]}`, type:'select', minWidth:58, emptyOption:'·',
      options:[{ value:'1', label:'1' }, { value:'0.5', label:'½' }],
      onChange:(row, value) => {
        const attendance = { ...(row.attendance || {}) };
        if (value === '1' || value === '0.5') attendance[String(day)] = Number(value);
        else delete attendance[String(day)];
        return { attendance, reported_days:attendanceTotal(attendance) };
      },
    };
  });

  function appendPastedWorkers(patches) {
    setState((current) => ({
      ...current,
      workers:[...current.workers, ...patches.map((patch, index) => ({
        _key:`paste-${Date.now()}-${index}`, row_no:current.workers.length + index + 1,
        worker_name:'', iqama_no:'', reported_days:0, attendance:{}, daily_rate:null, notes:'', ...patch,
      }))],
      message:`أضيف ${patches.length} عامل من اللصق. اضغط «حفظ الكل» لتثبيتهم.`,
    }));
  }

  async function saveAll() {
    if (!state.sheet) return;
    setBusy(true);
    setState((current) => ({...current,error:'',message:''}));
    const sheetPayload = {
      external_project_name:String(state.sheet.external_project_name || '').trim(),
      site_location:String(state.sheet.site_location || '').trim() || null,
      default_daily_rate:state.sheet.default_daily_rate === '' || state.sheet.default_daily_rate == null ? null : n(state.sheet.default_daily_rate),
      vat_rate:state.sheet.vat_rate === '' || state.sheet.vat_rate == null ? DEFAULT_VAT_RATE : n(state.sheet.vat_rate),
      status:state.sheet.status,
      notes:String(state.sheet.notes || '').trim() || null,
      updated_at:new Date().toISOString(),
    };
    const sheetQ = await supabase.from('contractor_external_timesheets').update(sheetPayload).eq('id', id);
    if (sheetQ.error) {
      setBusy(false);
      setState((current) => ({...current,error:sheetQ.error.message}));
      return;
    }

    const validRows = state.workers.filter((row) => String(row.worker_name || '').trim());
    const existing = validRows.filter((row) => row.id);
    const fresh = validRows.filter((row) => !row.id);
    const updateResults = await Promise.all(existing.map((row,index) => supabase.from('contractor_external_timesheet_workers').update({
      row_no:index + 1,
      worker_name:String(row.worker_name).trim(),
      iqama_no:String(row.iqama_no || '').trim() || null,
      reported_days:n(row.reported_days),
      attendance:row.attendance || {},
      daily_rate:row.daily_rate === '' || row.daily_rate == null ? null : n(row.daily_rate),
      notes:String(row.notes || '').trim() || null,
      updated_at:new Date().toISOString(),
    }).eq('id',row.id)));
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) {
      setBusy(false);
      setState((current) => ({...current,error:updateError.message}));
      return;
    }
    if (fresh.length) {
      const insertQ = await supabase.from('contractor_external_timesheet_workers').insert(fresh.map((row,index) => ({
        timesheet_id:id,
        row_no:existing.length + index + 1,
        worker_name:String(row.worker_name).trim(),
        iqama_no:String(row.iqama_no || '').trim() || null,
        reported_days:n(row.reported_days),
        attendance:row.attendance || {},
        daily_rate:row.daily_rate === '' || row.daily_rate == null ? null : n(row.daily_rate),
        notes:String(row.notes || '').trim() || null,
      })));
      if (insertQ.error) {
        setBusy(false);
        setState((current) => ({...current,error:insertQ.error.message}));
        return;
      }
    }
    setBusy(false);
    await load();
    setState((current) => ({...current,message:'تم حفظ التايم شيت.'}));
  }

  async function removeWorker(row) {
    if (!row.id) {
      setState((current) => ({...current,workers:current.workers.filter((item) => item !== row)}));
      return;
    }
    if (!window.confirm(`حذف ${row.worker_name} من هذا التايم شيت؟`)) return;
    const { error } = await supabase.from('contractor_external_timesheet_workers').delete().eq('id',row.id);
    if (error) setState((current) => ({...current,error:error.message}));
    else load();
  }

  if (state.loading) return <ConstitutionPage><EmptyState title="جارٍ تحميل التايم شيت" /></ConstitutionPage>;
  if (!state.sheet) return <ConstitutionPage><Notice tone="warning">{state.error || 'لم يُعثر على التايم شيت.'}</Notice></ConstitutionPage>;

  const sheet = state.sheet;
  const monthName = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{month:'long',year:'numeric'}).format(new Date(sheet.period_year,sheet.period_month-1,1));

  return <ConstitutionPage>
    <PageHeader
      eyebrow="MONTHLY TIMESHEET"
      title={`${sheet.contractors?.name_ar || 'المقاول'} — ${sheet.external_project_name}`}
      description={`${monthName}${sheet.site_location ? ` · ${sheet.site_location}` : ''} · رقم ${sheet.sheet_no || '—'}`}
      actions={<Toolbar><Link className="btn ghost" href="/dashboard/contractors/timesheets">السجل</Link><a className="btn ghost" href={`/print/contractor-timesheet/${id}`} target="_blank">طباعة التايم شيت</a><a className="btn ghost" href={`/print/contractor-timesheet/${id}?doc=claim`} target="_blank">بيان مطالبة</a><button className="btn" onClick={saveAll} disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ الكل'}</button></Toolbar>}
    />

    {state.error ? <Notice tone="warning">{state.error}</Notice> : null}
    {state.message ? <Notice>{state.message}</Notice> : null}

    <div className={styles.workspace}>
      <Section title="بيانات المستند">
        <div className="form-grid" style={{padding:16}}>
          <div className="field span2"><label>المشروع الخارجي</label><input value={sheet.external_project_name || ''} onChange={(e)=>patchSheet({external_project_name:e.target.value})}/></div>
          <div className="field"><label>الموقع</label><input value={sheet.site_location || ''} onChange={(e)=>patchSheet({site_location:e.target.value})}/></div>
          <div className="field"><label>الحالة</label><select value={sheet.status || 'draft'} onChange={(e)=>patchSheet({status:e.target.value})}>{Object.entries(STATUS_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
          <div className="field"><label>اليومية الافتراضية</label><input type="number" min="0" step="0.01" dir="ltr" value={sheet.default_daily_rate ?? ''} onChange={(e)=>patchSheet({default_daily_rate:e.target.value})} placeholder="يمكن إضافتها لاحقًا"/></div>
          <div className="field"><label>ضريبة القيمة المضافة</label><select value={String(sheet.vat_rate ?? DEFAULT_VAT_RATE)} onChange={(e)=>patchSheet({vat_rate:e.target.value})}><option value="0.15">15% — خاضع للضريبة</option><option value="0">0% — بدون ضريبة</option></select></div>
          <div className="field span2"><label>ملاحظات داخلية</label><input value={sheet.notes || ''} onChange={(e)=>patchSheet({notes:e.target.value})}/></div>
        </div>
      </Section>


      <Section title={`الشهر كاملًا — ${monthName}`} description="ورقة الشهر: الصق من إكسل الاسم ورقم الإقامة والأيام المبلّغة (تُضاف صفوف جديدة تلقائيًا)، واكتب في خانة اليوم 1 أو ½، أو حدّد نطاقًا والصق 1 أو اضغط Ctrl+D. «زرع» يوزع الأيام المبلّغة على الشهر (غير الجمعة أولًا).">
        <div className={styles.controls} style={{padding:'0 0 10px'}}><button type="button" className="btn ghost" onClick={addBlank}>عامل فارغ</button><button type="button" className="btn ghost" onClick={seedAll}>زرع الأيام للجميع</button></div>
        <div style={{contain:'inline-size',width:'100%',minWidth:0}}><RawGrid
          rows={sheetRows}
          rowKey={(row)=>row._rowKey}
          savedFlag={(row)=>Boolean(row.id)}
          onPatchRow={patchWorker}
          onAppendRows={appendPastedWorkers}
          emptyMessage="أضف العمال: الصق قائمتهم من إكسل هنا بعد إضافة عامل فارغ، أو استخدم «عامل فارغ»."
          columns={[
            {key:'_seq',label:'م',type:'index',render:(row)=>sheetRows.indexOf(row)+1},
            {key:'worker_name',label:'اسم العامل',type:'text',minWidth:180},
            {key:'iqama_no',label:'رقم الإقامة',type:'text',minWidth:120},
            {key:'reported_days',label:'الأيام المبلّغة',type:'number',step:0.5,min:0},
            ...dayColumns,
            {key:'_days',label:'مجموع الشهر',type:'computed',numeric:true,total:'sum',formula:'مجموع خانات الأيام (1 يوم كامل، ½ نصف يوم)',compute:(row)=>attendanceTotal(row.attendance)},
            {key:'daily_rate',label:'اليومية',type:'number',step:0.01,min:0},
            {key:'_due',label:'المستحق',type:'computed',numeric:true,total:'sum',formula:'مجموع الشهر × اليومية (أو يومية المستند)',compute:(row)=>round2(attendanceTotal(row.attendance)*n(row.daily_rate===''||row.daily_rate==null?sheet.default_daily_rate:row.daily_rate)),format:(v)=>money(v)},
            {key:'_action',label:'إجراء',type:'action',render:(row)=><span style={{display:'inline-flex',gap:4}}><button type="button" className={rawGridStyles.actionButton} onClick={()=>seedRow(row,sheetRows.indexOf(row))}>زرع</button><button type="button" className={rawGridStyles.actionButton} onClick={()=>removeWorker(row)}>حذف</button></span>},
          ]}
        /></div>
      </Section>

      <Section title="ملخص المطالبة المبدئية" description="التسعير والضريبة لا يؤثران على التايم شيت نفسه ويمكن تعديلهما قبل إصدار المطالبة.">
        <div className={styles.summary} style={{padding:'0 0 12px'}}>
          <div className={styles.summaryCard}><span>عدد العمال</span><strong>{state.workers.length}</strong></div>
          <div className={styles.summaryCard}><span>إجمالي أيام العمل</span><strong>{totalDays.toLocaleString('ar-SA-u-ca-gregory-nu-latn')}</strong></div>
          <div className={styles.summaryCard}><span>اليومية الافتراضية</span><strong>{sheet.default_daily_rate == null || sheet.default_daily_rate === '' ? 'غير محددة' : `${money(sheet.default_daily_rate)} ر.س`}</strong></div>
          <div className={styles.summaryCard}><span>قبل الضريبة</span><strong>{claimTotal ? `${money(claimTotal)} ر.س` : '—'}</strong></div>
          <div className={styles.summaryCard}><span>ضريبة القيمة المضافة {(vatRate*100).toFixed(0)}%</span><strong>{claimTotal ? `${money(claimVat)} ر.س` : '—'}</strong></div>
          <div className={styles.summaryCard}><span>شامل الضريبة</span><strong>{claimTotal ? `${money(claimTotalWithVat)} ر.س` : '—'}</strong></div>
        </div>
        <table className={styles.claimTable}><thead><tr><th>العامل</th><th className={styles.num}>الأيام</th><th className={styles.num}>اليومية</th><th className={styles.num}>الإجمالي</th></tr></thead><tbody>{state.workers.map((row,index)=>{const rate=row.daily_rate==null||row.daily_rate===''?sheet.default_daily_rate:row.daily_rate;return <tr key={`claim-${workerKey(row,index)}`}><td>{row.worker_name||'—'}</td><td className={styles.num}>{n(row.reported_days)}</td><td className={styles.num}>{rate==null||rate===''?'—':money(rate)}</td><td className={styles.num}>{rate==null||rate===''?'—':money(n(row.reported_days)*n(rate))}</td></tr>;})}</tbody></table>
      </Section>

      <Section title="وسيلة الدفع في المطالبة" description="بيانات ثابتة تظهر تلقائيًا في بيان مطالبة التايم شيت الخارجي.">
        <div className="form-grid" style={{padding:16}}>
          <div className="field"><label>اسم البنك</label><input value={PAYMENT_DETAILS.bank} readOnly /></div>
          <div className="field"><label>اسم المستفيد</label><input value={PAYMENT_DETAILS.beneficiary} readOnly /></div>
          <div className="field span2"><label>رقم الآيبان</label><input dir="ltr" value={PAYMENT_DETAILS.iban} readOnly /></div>
        </div>
      </Section>
    </div>
  </ConstitutionPage>;
}