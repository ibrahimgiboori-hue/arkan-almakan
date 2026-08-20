'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './movements.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const iso=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function moveDate(value,days){const [y,m,d]=String(value).split('-').map(Number);const n=new Date(y,m-1,d);n.setDate(n.getDate()+days);return iso(n)}
function dateLabel(value){const [y,m,d]=String(value).split('-').map(Number);return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d))}
const STATUS_AR={full:'كامل',half:'نصف يوم',absent:'غياب',stopped:'توقف',leave:'إجازة'};
const CHARGE_AR={arkan:'أركان',contractor:'المقاول',owner:'المالك'};
const EMPTY_SUMMARY={attendance:0,full:0,half:0,absent:0,outputs:0,expenses:0,custody:0,advances:0,payments:0};

export default function MovementsPage(){
  const {id:projectId}=useParams();
  const dateKey=`arkan.project.ops.date.${projectId}`;
  const [date,setDate]=useState(iso(new Date()));
  const [rows,setRows]=useState([]);
  const [summary,setSummary]=useState(EMPTY_SUMMARY);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [filter,setFilter]=useState('all');

  useEffect(()=>{if(typeof window==='undefined')return;const saved=localStorage.getItem(dateKey);if(saved)setDate(saved)},[dateKey]);
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem(dateKey,date)},[date,dateKey]);

  const load=useCallback(async()=>{
    if(!projectId||!date)return;
    setLoading(true);setErr('');setRows([]);setSummary(EMPTY_SUMMARY);
    try{
      const dayQ=await supabase.from('timesheet_days').select('id').eq('project_id',projectId).eq('work_date',date).maybeSingle();
      if(dayQ.error)throw dayQ.error;
      const dayId=dayQ.data?.id||null;
      const [attQ,outQ,expQ,custQ,advQ,payQ]=await Promise.all([
        dayId?supabase.from('attendance').select('id,laborer_id,status').eq('day_id',dayId):Promise.resolve({data:[],error:null}),
        dayId?supabase.from('day_items').select('id,project_item_id,contractor_id,group_output,unit,notes,created_at').eq('day_id',dayId):Promise.resolve({data:[],error:null}),
        supabase.from('contractor_expenses').select('id,contractor_id,category,amount,payer,charge_to,notes,created_at').eq('project_id',projectId).eq('expense_date',date),
        supabase.from('custody_transactions').select('id,custody_id,direction,amount,category,beneficiary,charge_to,contractor_id,notes,created_at').eq('project_id',projectId).eq('trx_date',date),
        supabase.from('contractor_advances').select('id,contractor_id,amount,notes,created_at').eq('project_id',projectId).eq('advance_date',date),
        supabase.from('contractor_payments').select('id,contractor_id,amount,source,reference,notes,created_at').eq('project_id',projectId).eq('payment_date',date),
      ]);
      const error=[attQ,outQ,expQ,custQ,advQ,payQ].find(x=>x.error)?.error;if(error)throw error;
      const laborIds=[...new Set((attQ.data||[]).map(x=>x.laborer_id).filter(Boolean))];
      const contractorIds=[...new Set([...(outQ.data||[]).map(x=>x.contractor_id),...(expQ.data||[]).map(x=>x.contractor_id),...(custQ.data||[]).map(x=>x.contractor_id),...(advQ.data||[]).map(x=>x.contractor_id),...(payQ.data||[]).map(x=>x.contractor_id)].filter(Boolean))];
      const itemIds=[...new Set((outQ.data||[]).map(x=>x.project_item_id).filter(Boolean))];
      const [labQ,conQ,itemQ]=await Promise.all([
        laborIds.length?supabase.from('laborers').select('id,full_name').in('id',laborIds):Promise.resolve({data:[],error:null}),
        contractorIds.length?supabase.from('contractors').select('id,name_ar,operation_alias').in('id',contractorIds):Promise.resolve({data:[],error:null}),
        itemIds.length?supabase.from('project_items').select('id,description_ar,unit').in('id',itemIds):Promise.resolve({data:[],error:null}),
      ]);
      const secondError=[labQ,conQ,itemQ].find(x=>x.error)?.error;if(secondError)throw secondError;
      const labor=Object.fromEntries((labQ.data||[]).map(x=>[x.id,x.full_name]));
      const contractors=Object.fromEntries((conQ.data||[]).map(x=>[x.id,x.operation_alias||x.name_ar]));
      const items=Object.fromEntries((itemQ.data||[]).map(x=>[x.id,x]));
      const unified=[];
      for(const x of attQ.data||[])unified.push({id:`a-${x.id}`,type:'attendance',time:null,title:labor[x.laborer_id]||'عامل',detail:STATUS_AR[x.status]||x.status,value:null});
      for(const x of outQ.data||[]){const item=items[x.project_item_id];unified.push({id:`o-${x.id}`,type:'output',time:x.created_at,title:item?.description_ar||'إنجاز',detail:contractors[x.contractor_id]||'—',value:`${Number(x.group_output||0).toLocaleString('en-US')} ${x.unit||item?.unit||''}`})}
      for(const x of expQ.data||[])unified.push({id:`e-${x.id}`,type:'expense',time:x.created_at,title:x.category||'مصروف',detail:`${contractors[x.contractor_id]||'—'}${x.notes?` · ${x.notes}`:''}`,value:`${money(x.amount)} ر.س`});
      for(const x of custQ.data||[])unified.push({id:`c-${x.id}`,type:'custody',time:x.created_at,title:x.direction==='issue'?'تعزيز عهدة':x.direction==='return'?'إرجاع عهدة':'صرف من العهدة',detail:`${x.category||x.beneficiary||x.notes||'—'}${x.charge_to?` · على ${CHARGE_AR[x.charge_to]||x.charge_to}`:''}`,value:`${money(x.amount)} ر.س`});
      for(const x of advQ.data||[])unified.push({id:`v-${x.id}`,type:'advance',time:x.created_at,title:'سلفة مقاول',detail:`${contractors[x.contractor_id]||'—'}${x.notes?` · ${x.notes}`:''}`,value:`${money(x.amount)} ر.س`});
      for(const x of payQ.data||[])unified.push({id:`p-${x.id}`,type:'payment',time:x.created_at,title:'دفعة مقاول',detail:`${contractors[x.contractor_id]||'—'}${x.reference?` · ${x.reference}`:''}`,value:`${money(x.amount)} ر.س`});
      unified.sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));
      setRows(unified);
      const att=attQ.data||[];
      setSummary({
        attendance:att.length,
        full:att.filter(x=>x.status==='full').length,
        half:att.filter(x=>x.status==='half').length,
        absent:att.filter(x=>x.status==='absent').length,
        outputs:(outQ.data||[]).length,
        expenses:(expQ.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),
        custody:(custQ.data||[]).filter(x=>x.direction==='spend').reduce((s,x)=>s+Number(x.amount||0),0),
        advances:(advQ.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),
        payments:(payQ.data||[]).reduce((s,x)=>s+Number(x.amount||0),0),
      });
    }catch(e){setErr('تعذر تحميل حركات اليوم: '+(e.message||e))}
    setLoading(false);
  },[projectId,date]);
  useEffect(()=>{load()},[load]);

  const visible=useMemo(()=>filter==='all'?rows:rows.filter(x=>x.type===filter),[rows,filter]);
  const filters=[['all','الكل'],['attendance','الحضور'],['output','الإنجاز'],['expense','المصروفات'],['custody','العهدة'],['advance','السلف'],['payment','الدفعات']];

  return <div className={styles.root} dir="rtl">
    <header className={styles.context}>
      <div><span>DAILY LEDGER</span><h2>حركات اليوم</h2><p>صورة المشروع كاملة في التاريخ المختار.</p></div>
      <div className={styles.dateNav}><button onClick={()=>setDate(d=>moveDate(d,1))}>←</button><div><strong>{dateLabel(date)}</strong><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><button onClick={()=>setDate(d=>moveDate(d,-1))}>→</button></div>
      <button className={styles.today} onClick={()=>setDate(iso(new Date()))}>اليوم</button>
    </header>
    {err&&<div className={styles.error}>{err}</div>}
    <section className={styles.summary}>
      <div><span>الحضور</span><strong>{summary.attendance}</strong><small>{summary.full} كامل · {summary.half} نصف · {summary.absent} غياب</small></div>
      <div><span>حركات الإنجاز</span><strong>{summary.outputs}</strong><small>حركة كمية</small></div>
      <div><span>مصروفات مباشرة</span><strong>{money(summary.expenses)}</strong><small>ر.س</small></div>
      <div><span>صرف من العهدة</span><strong>{money(summary.custody)}</strong><small>ر.س</small></div>
      <div><span>سلف</span><strong>{money(summary.advances)}</strong><small>ر.س</small></div>
      <div><span>دفعات</span><strong>{money(summary.payments)}</strong><small>ر.س</small></div>
    </section>
    <div className={styles.filters}>{filters.map(([k,v])=><button key={k} className={filter===k?styles.on:''} onClick={()=>setFilter(k)}>{v}</button>)}</div>
    {loading?<div className={styles.empty}>جارٍ تجميع حركة اليوم…</div>:visible.length===0?<div className={styles.empty}>لا توجد حركات ضمن هذا التصنيف في اليوم المختار.</div>:<div className={styles.ledger}>{visible.map(row=><div className={styles.row} key={row.id}><span className={`${styles.marker} ${styles[`m_${row.type}`]||''}`}></span><div className={styles.copy}><strong>{row.title}</strong><small>{row.detail}</small></div>{row.value&&<b>{row.value}</b>}<time>{row.time?new Date(row.time).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}):'—'}</time></div>)}</div>}
  </div>;
}
