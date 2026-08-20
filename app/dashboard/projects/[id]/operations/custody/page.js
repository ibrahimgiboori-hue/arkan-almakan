'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './custody.module.css';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0,10);
const DIRECTION_AR = { issue:'تعزيز العهدة', spend:'صرف من العهدة', return:'إرجاع متبقي' };
const CHARGE_AR = { arkan:'أركان', contractor:'المقاول', owner:'المالك' };

export default function CustodyPage(){
  const { id:projectId } = useParams();
  const [custodies,setCustodies] = useState([]);
  const [selectedId,setSelectedId] = useState('');
  const [transactions,setTransactions] = useState([]);
  const [employees,setEmployees] = useState({});
  const [contractors,setContractors] = useState([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);
  const [form,setForm] = useState({ direction:'spend', trx_date:todayIso(), amount:'', category:'مصروف تشغيلي', beneficiary:'', charge_to:'arkan', contractor_id:'', notes:'' });

  const load = useCallback(async()=>{
    if(!projectId)return;
    setLoading(true); setFeedback(null);
    try{
      const [balanceQ,custodyQ,linksQ] = await Promise.all([
        supabase.from('v_custody_balance').select('custody_id,custody_no,employee_id,project_id,status,balance').eq('project_id',projectId),
        supabase.from('custodies').select('id,custody_no,employee_id,project_id,is_restricted,opened_at,status,purpose').eq('project_id',projectId).order('opened_at',{ascending:false}),
        supabase.from('project_contractors').select('contractor_id,is_active').eq('project_id',projectId).eq('is_active',true),
      ]);
      const firstError=[balanceQ,custodyQ,linksQ].find(x=>x.error)?.error; if(firstError)throw firstError;
      const balances=new Map((balanceQ.data||[]).map(x=>[x.custody_id,x]));
      const rows=(custodyQ.data||[]).map(x=>({...x,balance:Number(balances.get(x.id)?.balance||0)}));
      setCustodies(rows);
      const empIds=[...new Set(rows.map(x=>x.employee_id).filter(Boolean))];
      const contractorIds=[...new Set((linksQ.data||[]).map(x=>x.contractor_id).filter(Boolean))];
      const [empQ,contractorQ]=await Promise.all([
        empIds.length?supabase.from('employees').select('id,full_name_ar').in('id',empIds):Promise.resolve({data:[],error:null}),
        contractorIds.length?supabase.from('contractors').select('id,name_ar,operation_alias').in('id',contractorIds):Promise.resolve({data:[],error:null}),
      ]);
      if(empQ.error)throw empQ.error; if(contractorQ.error)throw contractorQ.error;
      setEmployees(Object.fromEntries((empQ.data||[]).map(x=>[x.id,x.full_name_ar])));
      setContractors(contractorQ.data||[]);
      setSelectedId(current=>current&&rows.some(x=>x.id===current)?current:(rows[0]?.id||''));
    }catch(e){ setFeedback({type:'error',text:'تعذر تحميل العهد: '+(e.message||e)}); }
    setLoading(false);
  },[projectId]);

  const loadTransactions = useCallback(async()=>{
    if(!selectedId){setTransactions([]);return;}
    const q=await supabase.from('custody_transactions')
      .select('id,direction,trx_date,amount,category,beneficiary,notes,charge_to,contractor_id,is_recovered,recovered_ref,owner_approved,created_at')
      .eq('custody_id',selectedId)
      .order('trx_date',{ascending:false}).order('created_at',{ascending:false});
    if(q.error)setFeedback({type:'error',text:'تعذر تحميل حركات العهدة: '+q.error.message}); else setTransactions(q.data||[]);
  },[selectedId]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{loadTransactions();},[loadTransactions]);

  const selected=useMemo(()=>custodies.find(x=>x.id===selectedId)||null,[custodies,selectedId]);
  const totals=useMemo(()=>transactions.reduce((a,x)=>{const v=Number(x.amount||0); if(x.direction==='issue')a.issued+=v; if(x.direction==='spend')a.spent+=v; if(x.direction==='return')a.returned+=v; return a;},{issued:0,spent:0,returned:0}),[transactions]);

  async function saveTransaction(e){
    e.preventDefault();
    if(!selected||!Number(form.amount))return;
    if(typeof navigator!=='undefined'&&navigator.onLine===false){setFeedback({type:'error',text:'حركات العهدة المالية تحتاج اتصالًا مباشرًا حتى نتأكد من الرصيد قبل الحفظ.'});return;}
    setBusy(true); setFeedback(null);
    try{
      const payload={
        custody_id:selected.id,
        direction:form.direction,
        trx_date:form.trx_date,
        amount:Number(form.amount),
        project_id:projectId,
        category:form.direction==='spend'?form.category:(form.direction==='issue'?'تعزيز عهدة':'إرجاع عهدة'),
        beneficiary:form.direction==='spend'?(form.beneficiary||null):null,
        notes:form.notes||null,
        charge_to:form.direction==='spend'?form.charge_to:null,
        contractor_id:form.direction==='spend'&&form.charge_to==='contractor'?(form.contractor_id||null):null,
      };
      const ins=await supabase.from('custody_transactions').insert(payload).select('id').single();
      if(ins.error)throw ins.error;
      const proof=await supabase.from('custody_transactions').select('id,amount,direction,trx_date').eq('id',ins.data.id).single();
      if(proof.error||!proof.data?.id)throw proof.error||new Error('تعذر إثبات حفظ الحركة');
      setFeedback({type:'success',text:`تم حفظ ${DIRECTION_AR[form.direction]} بمبلغ ${money(form.amount)} ر.س والتحقق منها.`});
      setForm(f=>({...f,amount:'',beneficiary:'',notes:''}));
      await load(); await loadTransactions();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ حركة العهدة: '+(e.message||e)});}
    setBusy(false);
  }

  async function settle(){
    if(!selected||selected.balance!==0)return;
    if(!window.confirm('تسوية هذه العهدة؟ سيتم تغيير حالتها إلى «مسوّاة».'))return;
    setBusy(true); setFeedback(null);
    const q=await supabase.from('custodies').update({status:'settled'}).eq('id',selected.id).eq('status','open').select('id').maybeSingle();
    if(q.error)setFeedback({type:'error',text:'تعذر تسوية العهدة: '+q.error.message}); else {setFeedback({type:'success',text:'تمت تسوية العهدة.'}); await load();}
    setBusy(false);
  }

  if(loading)return <div className={styles.empty}>جارٍ تحميل عهد المشروع…</div>;
  if(!custodies.length)return <div className={styles.empty}><strong>لا توجد عهدة مرتبطة بهذا المشروع.</strong><span>عند فتح عهدة للمشروع ستظهر هنا مع الرصيد والحركات.</span></div>;

  return <div className={styles.root} dir="rtl">
    <header className={styles.head}>
      <div><span>PROJECT CUSTODY</span><h2>العهدة</h2><p>رصيد فعلي وحركات إصدار وصرف وإرجاع داخل المشروع.</p></div>
      <select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>{custodies.map(c=><option key={c.id} value={c.id}>{c.custody_no} — {employees[c.employee_id]||'موظف'}</option>)}</select>
    </header>

    {feedback&&<div className={feedback.type==='error'?styles.error:styles.success}>{feedback.text}</div>}

    <section className={styles.summary}>
      <div><span>صاحب العهدة</span><strong>{employees[selected.employee_id]||'—'}</strong><small>{selected.custody_no}</small></div>
      <div><span>إجمالي الإصدار</span><strong>{money(totals.issued)}</strong><small>ر.س</small></div>
      <div><span>المصروف</span><strong>{money(totals.spent)}</strong><small>ر.س</small></div>
      <div><span>المعاد</span><strong>{money(totals.returned)}</strong><small>ر.س</small></div>
      <div className={styles.balance}><span>الرصيد المتبقي</span><strong>{money(selected.balance)}</strong><small>ر.س</small></div>
    </section>

    <section className={styles.grid}>
      <main className={styles.formPane}>
        <div className={styles.sectionTitle}><div><span>NEW MOVEMENT</span><h3>حركة عهدة</h3></div>{selected.status==='open'&&selected.balance===0&&<button type="button" onClick={settle} disabled={busy}>تسوية العهدة</button>}</div>
        <form onSubmit={saveTransaction} className={styles.form}>
          <label><span>نوع الحركة</span><select value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))}><option value="spend">صرف من العهدة</option><option value="issue">تعزيز العهدة</option><option value="return">إرجاع متبقي</option></select></label>
          <label><span>التاريخ</span><input type="date" value={form.trx_date} onChange={e=>setForm(f=>({...f,trx_date:e.target.value}))}/></label>
          <label><span>المبلغ</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></label>
          {form.direction==='spend'&&<>
            <label><span>التصنيف</span><input value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></label>
            <label className={styles.wide}><span>البيان / المستفيد</span><input required value={form.beneficiary} onChange={e=>setForm(f=>({...f,beneficiary:e.target.value}))} placeholder="مثال: إيجار معدات الموقع"/></label>
            <label><span>على من؟</span><select value={form.charge_to} onChange={e=>setForm(f=>({...f,charge_to:e.target.value,contractor_id:e.target.value==='contractor'?f.contractor_id:''}))}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            {form.charge_to==='contractor'&&<label><span>المقاول</span><select required value={form.contractor_id} onChange={e=>setForm(f=>({...f,contractor_id:e.target.value}))}><option value="">اختر المقاول</option>{contractors.map(c=><option key={c.id} value={c.id}>{c.operation_alias||c.name_ar}</option>)}</select></label>}
          </>}
          <label className={styles.wide}><span>ملاحظة</span><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="اختياري"/></label>
          <button className={styles.primary} disabled={busy||selected.status!=='open'}>{busy?'جارٍ الحفظ…':'حفظ الحركة'}</button>
        </form>
        <div className={styles.purpose}><span>الغرض من العهدة</span><p>{selected.purpose||'غير محدد'}</p><small>افتتحت في {selected.opened_at} · الحالة: {selected.status==='open'?'مفتوحة':selected.status==='settled'?'مسوّاة':'مغلقة'}</small></div>
      </main>

      <aside className={styles.history}>
        <div className={styles.historyHead}><div><span>LEDGER</span><h3>سجل الحركات</h3></div><strong>{transactions.length}</strong></div>
        <div className={styles.list}>{transactions.map(row=><div className={styles.row} key={row.id}>
          <div className={styles.rowMain}><span className={`${styles.dot} ${styles[`dot_${row.direction}`]||''}`}></span><div><strong>{DIRECTION_AR[row.direction]||row.direction}</strong><small>{row.category||row.beneficiary||row.notes||'—'} · {row.trx_date}</small></div></div>
          <div className={styles.rowAmount}><strong>{money(row.amount)}</strong><small>{row.charge_to?CHARGE_AR[row.charge_to]:'ر.س'}</small></div>
        </div>)}</div>
      </aside>
    </section>
  </div>;
}
