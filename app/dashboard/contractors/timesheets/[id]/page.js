'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, EmptyState, Notice, Toolbar } from '@/components/ui/ConstitutionUI';
import styles from '../timesheet.module.css';

const STATUS_AR = { draft:'مسودة', reviewed:'مراجع', approved:'معتمد', closed:'مغلق' };
const WEEKDAY = ['أحد','اثن','ثلا','أرب','خمي','جمع','سبت'];
const DEFAULT_VAT_RATE = 0.15;
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
  return Number(value || 0).toLocaleString('ar-SA', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

export default function ExternalTimesheetEditor() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, sheet:null, workers:[], error:'', message:'' });
  const [quickText, setQuickText] = useState('');
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

  function importQuick() {
    const rows = quickText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const parts = line.split(/\t|\||،|,/).map((part) => part.trim());
      return {
        _key:`quick-${Date.now()}-${index}`,
        row_no:state.workers.length + index + 1,
        worker_name:parts[0] || '',
        iqama_no:parts[1] || '',
        reported_days:parts[2] === undefined || parts[2] === '' ? 0 : n(parts[2]),
        attendance:{}, daily_rate:null, notes:'',
      };
    }).filter((row) => row.worker_name);
    if (!rows.length) return;
    setState((current) => ({...current,workers:[...current.workers,...rows],message:`أضيف ${rows.length} عامل للإدخال. اضغط «حفظ الكل» لتثبيتهم.`}));
    setQuickText('');
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
  const monthName = new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{month:'long',year:'numeric'}).format(new Date(sheet.period_year,sheet.period_month-1,1));

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

      <Section title="إدخال العمال" description="للإدخال السريع: كل سطر = الاسم | رقم الإقامة | عدد الأيام">
        <div className={styles.quickGrid} style={{padding:16}}>
          <div className="field"><label>قائمة سريعة</label><textarea value={quickText} onChange={(e)=>setQuickText(e.target.value)} placeholder={'Mohamed Ahmed | 2619707017 | 25\nAdil Khan | 2633788886 | 25'} /></div>
          <div>
            <div className={styles.controls}><button type="button" className="btn" onClick={importQuick}>إضافة القائمة</button><button type="button" className="btn ghost" onClick={addBlank}>عامل فارغ</button><button type="button" className="btn ghost" onClick={seedAll}>زرع الأيام للجميع</button></div>
            <div className="hint" style={{marginTop:10}}>الزرع يبدأ بأيام الشهر غير الجمعة، ثم يستخدم الجمعة فقط إذا تجاوز العدد الأيام المتاحة. بعد ذلك تستطيع تغيير أي خانة يدويًا.</div>
          </div>
        </div>
      </Section>

      <Section title={`الشهر كاملًا — ${monthName}`} description="اضغط خانة اليوم للتبديل: حضور كامل ← نصف يوم ← فارغ.">
        <div className={styles.scroll}>
          <table className={styles.monthGrid}>
            <thead><tr><th className={styles.seq}>م</th><th className={styles.name}>اسم العامل</th><th className={styles.iqama}>رقم الإقامة</th>{days.map((day)=>{const date=new Date(sheet.period_year,sheet.period_month-1,day);return <th key={day} className={styles.day}><div className={styles.dayHead}><b>{day}</b><small>{WEEKDAY[date.getDay()]}</small></div></th>;})}<th className={styles.total}>الأيام</th><th className={styles.total}>اليومية</th><th className={styles.total}>إجراء</th></tr></thead>
            <tbody>{state.workers.map((row,index)=>{const key=workerKey(row,index);return <tr key={key}>
              <td>{index+1}</td>
              <td className={styles.name}><input className={styles.rowInput} value={row.worker_name || ''} onChange={(e)=>patchWorker(key,{worker_name:e.target.value})}/></td>
              <td className={styles.iqama}><input className={styles.rowInput} dir="ltr" value={row.iqama_no || ''} onChange={(e)=>patchWorker(key,{iqama_no:e.target.value})}/></td>
              {days.map((day)=>{const value=n(row.attendance?.[String(day)]);return <td key={day} className={styles.day}><button type="button" className={styles.cellButton} data-value={String(value)} title={`اليوم ${day}`} onClick={()=>toggleDay(row,index,day)}>{value===1?'✓':value===0.5?'½':'·'}</button></td>;})}
              <td className={styles.total}><input className={styles.rowInput} type="number" min="0" max={dayCount} step="0.5" dir="ltr" value={row.reported_days ?? 0} onChange={(e)=>patchWorker(key,{reported_days:e.target.value})}/><button type="button" className="btn ghost" style={{padding:'3px 6px',fontSize:11,marginTop:3}} onClick={()=>seedRow(row,index)}>زرع</button></td>
              <td className={styles.total}><input className={styles.rowInput} type="number" min="0" step="0.01" dir="ltr" value={row.daily_rate ?? ''} onChange={(e)=>patchWorker(key,{daily_rate:e.target.value})} placeholder={sheet.default_daily_rate ?? '—'}/></td>
              <td><button type="button" className="btn ghost" style={{padding:'4px 6px'}} onClick={()=>removeWorker(row)}>حذف</button></td>
            </tr>;})}</tbody>
          </table>
        </div>
        {!state.workers.length ? <EmptyState title="أضف العمال أولًا" /> : null}
      </Section>

      <Section title="ملخص المطالبة المبدئية" description="التسعير والضريبة لا يؤثران على التايم شيت نفسه ويمكن تعديلهما قبل إصدار المطالبة.">
        <div className={styles.summary} style={{padding:'0 0 12px'}}>
          <div className={styles.summaryCard}><span>عدد العمال</span><strong>{state.workers.length}</strong></div>
          <div className={styles.summaryCard}><span>إجمالي أيام العمل</span><strong>{totalDays.toLocaleString('ar-SA')}</strong></div>
          <div className={styles.summaryCard}><span>اليومية الافتراضية</span><strong>{sheet.default_daily_rate == null || sheet.default_daily_rate === '' ? 'غير محددة' : `${money(sheet.default_daily_rate)} ر.س`}</strong></div>
          <div className={styles.summaryCard}><span>قبل الضريبة</span><strong>{claimTotal ? `${money(claimTotal)} ر.س` : '—'}</strong></div>
          <div className={styles.summaryCard}><span>ضريبة القيمة المضافة {(vatRate*100).toFixed(0)}%</span><strong>{claimTotal ? `${money(claimVat)} ر.س` : '—'}</strong></div>
          <div className={styles.summaryCard}><span>شامل الضريبة</span><strong>{claimTotal ? `${money(claimTotalWithVat)} ر.س` : '—'}</strong></div>
        </div>
        <table className={styles.claimTable}><thead><tr><th>العامل</th><th className={styles.num}>الأيام</th><th className={styles.num}>اليومية</th><th className={styles.num}>الإجمالي</th></tr></thead><tbody>{state.workers.map((row,index)=>{const rate=row.daily_rate==null||row.daily_rate===''?sheet.default_daily_rate:row.daily_rate;return <tr key={`claim-${workerKey(row,index)}`}><td>{row.worker_name||'—'}</td><td className={styles.num}>{n(row.reported_days)}</td><td className={styles.num}>{rate==null||rate===''?'—':money(rate)}</td><td className={styles.num}>{rate==null||rate===''?'—':money(n(row.reported_days)*n(rate))}</td></tr>;})}</tbody></table>
      </Section>
    </div>
  </ConstitutionPage>;
}