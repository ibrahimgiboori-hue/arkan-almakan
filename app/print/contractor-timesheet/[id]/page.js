'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import styles from './timesheet-print.module.css';

const WEEKDAY_FULL = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const STATUS_AR = { draft:'مسودة', reviewed:'مراجع', approved:'معتمد', closed:'مغلق' };
const n = (value) => Number(value || 0);
const money = (value) => Number(value || 0).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2});

function daysInMonth(year, month) { return new Date(Number(year),Number(month),0).getDate(); }
function mark(value) { const number=n(value); return number===1?'✓':number===0.5?'½':''; }
function dayNo(day) { return String(day).padStart(2,'0'); }

export default function ExternalContractorTimesheetPrint() {
  const { id } = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const [doc,setDoc] = useState(sp.get('doc') === 'claim' ? 'claim' : 'timesheet');
  const [state,setState] = useState({loading:true,sheet:null,workers:[],cfg:null,error:''});

  useEffect(()=>setDoc(sp.get('doc') === 'claim' ? 'claim' : 'timesheet'),[sp]);
  useEffect(()=>{
    if(!id)return;
    let alive=true;
    (async()=>{
      const [sheetQ,workersQ,cfgQ]=await Promise.all([
        supabase.from('contractor_external_timesheets').select('*,contractors(name_ar,contractor_no)').eq('id',id).maybeSingle(),
        supabase.from('contractor_external_timesheet_workers').select('*').eq('timesheet_id',id).order('row_no').order('created_at'),
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      ]);
      if(!alive)return;
      const error=sheetQ.error||workersQ.error||cfgQ.error;
      setState({loading:false,sheet:sheetQ.data||null,workers:workersQ.data||[],cfg:cfgQ.data||null,error:error?.message||''});
    })();
    return()=>{alive=false;};
  },[id]);

  const totalDays=useMemo(()=>state.workers.reduce((sum,row)=>sum+n(row.reported_days),0),[state.workers]);
  const claimTotal=useMemo(()=>state.workers.reduce((sum,row)=>{
    const rate=row.daily_rate==null||row.daily_rate===''?state.sheet?.default_daily_rate:row.daily_rate;
    return sum+n(row.reported_days)*n(rate);
  },0),[state.workers,state.sheet?.default_daily_rate]);

  if(state.loading)return <div style={{padding:40,direction:'rtl'}}>جارٍ تحميل التايم شيت…</div>;
  if(state.error||!state.sheet||!state.cfg)return <div style={{padding:40,direction:'rtl'}}>{state.error||'تعذر تحميل التايم شيت.'}</div>;

  const sheet=state.sheet;
  const dayCount=daysInMonth(sheet.period_year,sheet.period_month);
  const days=Array.from({length:dayCount},(_,index)=>index+1);
  const monthName=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{month:'long',year:'numeric'}).format(new Date(sheet.period_year,sheet.period_month-1,1));

  function selectDocument(next){
    setDoc(next);
    const params=new URLSearchParams(sp.toString());
    if(next==='claim')params.set('doc','claim');else params.delete('doc');
    router.replace(params.toString()?`?${params.toString()}`:'?',{scroll:false});
  }

  return <>
    <div className="print-toolbar no-print">
      <div className="group"><button className={doc==='timesheet'?'active':''} onClick={()=>selectDocument('timesheet')}>التايم شيت</button><button className={doc==='claim'?'active':''} onClick={()=>selectDocument('claim')}>بيان المطالبة</button></div>
      <div className="group"><button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button></div>
    </div>

    <ConstitutionPrintFrame documentKey="external_contractor_timesheet" cfg={state.cfg}>
      <div className={styles.document}>
        <div className={styles.head} data-print-keep-with-next="true">
          <div><h1>{doc==='claim'?'بيان مطالبة مبدئي':'كشف حضور شهري'}</h1><p>{doc==='claim'?'PROVISIONAL CLAIM STATEMENT':'MONTHLY TIMESHEET'}</p></div>
          <div className={styles.sheetNo}>رقم التايم شيت: {sheet.sheet_no||'—'} · {STATUS_AR[sheet.status]||sheet.status}</div>
        </div>

        <div className={styles.meta} data-print-keep-with-next="true">
          <div><span>المقاول</span><strong>{sheet.contractors?.name_ar||'—'}</strong></div>
          <div><span>المشروع</span><strong>{sheet.external_project_name}</strong></div>
          <div><span>الشهر</span><strong>{monthName}</strong></div>
          <div><span>الموقع</span><strong>{sheet.site_location||'—'}</strong></div>
        </div>

        {doc==='timesheet'?<>
          <table className={styles.table} data-print-flow="repeatable-table">
            <colgroup>
              <col className={styles.indexCol}/><col className={styles.nameCol}/><col className={styles.iqamaCol}/>
              {days.map((day)=><col key={day} className={styles.dayCol}/>)}
              <col className={styles.totalCol}/>
            </colgroup>
            <thead>
              <tr className={styles.weekdayRow}>
                <th rowSpan={2}>م</th><th rowSpan={2}>اسم العامل</th><th rowSpan={2}>رقم الإقامة</th>
                {days.map((day)=>{const date=new Date(sheet.period_year,sheet.period_month-1,day);const friday=date.getDay()===5;return <th key={day} className={friday?styles.friday:''}><div className={styles.weekdayCell}><span>{WEEKDAY_FULL[date.getDay()]}</span></div></th>;})}
                <th rowSpan={2}>الإجمالي</th>
              </tr>
              <tr className={styles.dateRow}>
                {days.map((day)=>{const date=new Date(sheet.period_year,sheet.period_month-1,day);return <th key={day} className={date.getDay()===5?styles.friday:''}><span className={styles.dateNo}>{dayNo(day)}</span></th>;})}
              </tr>
            </thead>
            <tbody>{state.workers.map((row,index)=><tr key={row.id||index}><td>{index+1}</td><td className={styles.name}>{row.worker_name}</td><td className={styles.iqama}>{row.iqama_no||'—'}</td>{days.map((day)=>{const value=n(row.attendance?.[String(day)]);const date=new Date(sheet.period_year,sheet.period_month-1,day);return <td key={day} className={date.getDay()===5?styles.friday:''}><span className={value===0.5?styles.half:styles.mark}>{mark(value)}</span></td>;})}<td className={styles.total}>{n(row.reported_days)}</td></tr>)}</tbody>
            <tfoot><tr className={styles.grand}><td colSpan={3+dayCount}>إجمالي أيام العمل لجميع العمال</td><td>{totalDays}</td></tr></tfoot>
          </table>
          <div className={styles.signoff} data-print-keep-together="true"><div><strong>إعداد</strong><span className={styles.line}/></div><div><strong>مراجعة</strong><span className={styles.line}/></div><div><strong>اعتماد</strong><span className={styles.line}/></div></div>
        </>:<>
          <p className={styles.claimIntro}>بالإشارة إلى العمالة الموضحة في كشف الحضور الشهري الخاص بمشروع <strong>{sheet.external_project_name}</strong> عن شهر <strong>{monthName}</strong>، نرفق أدناه ملخص الأيام والقيم للمطالبة والمراجعة.</p>
          <table className={styles.claimTable} data-print-flow="repeatable-table"><thead><tr><th style={{width:'8%'}}>م</th><th>اسم العامل</th><th style={{width:'22%'}}>رقم الإقامة</th><th className={styles.num} style={{width:'12%'}}>الأيام</th><th className={styles.num} style={{width:'15%'}}>اليومية</th><th className={styles.num} style={{width:'18%'}}>الإجمالي</th></tr></thead><tbody>{state.workers.map((row,index)=>{const rate=row.daily_rate==null||row.daily_rate===''?sheet.default_daily_rate:row.daily_rate;return <tr key={row.id||index}><td>{index+1}</td><td>{row.worker_name}</td><td className={styles.iqama}>{row.iqama_no||'—'}</td><td className={styles.num}>{n(row.reported_days)}</td><td className={styles.num}>{rate==null||rate===''?<span className={styles.muted}>غير محددة</span>:`${money(rate)} ر.س`}</td><td className={styles.num}>{rate==null||rate===''?'—':`${money(n(row.reported_days)*n(rate))} ر.س`}</td></tr>;})}</tbody></table>
          <div className={styles.claimTotal}><span>إجمالي المطالبة</span><span>{claimTotal?`${money(claimTotal)} ر.س`:'—'}</span></div>
          <div className={styles.signoff} data-print-keep-together="true"><div><strong>مقدم المطالبة</strong><span className={styles.line}/></div><div><strong>مراجعة</strong><span className={styles.line}/></div><div><strong>اعتماد</strong><span className={styles.line}/></div></div>
        </>}
      </div>
    </ConstitutionPrintFrame>
  </>;
}
