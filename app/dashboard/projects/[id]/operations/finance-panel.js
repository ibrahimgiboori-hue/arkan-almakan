'use client';

import { useCallback, useEffect, useState } from 'react';
import { projectOperationFinanceService } from '@/lib/application/project-operation-finance-service';
import { PROJECT_FINANCE_SOURCE_LABELS, summarizeProjectFinanceDay } from '@/lib/project-operation-finance.mjs';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import styles from './operations.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}
function PanelEmpty({children}){return <div className={styles.panelEmpty}>{children}</div>;}

export default function FinancePanel({projectId,date,contractor,onQueueChange}){
  const [kind,setKind]=useState('advance');
  const [advances,setAdvances]=useState([]);
  const [payments,setPayments]=useState([]);
  const [form,setForm]=useState({amount:'',notes:'',source:'bank',reference:''});
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);

  const load=useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setFeedback(null);
    try{
      const day=await projectOperationFinanceService.loadDay({projectId,date,contractorId:contractor.id});
      setAdvances(day.advances||[]);
      setPayments(day.payments||[]);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل السلف والدفعات: '+(e.message||e)});}
  },[projectId,date,contractor?.id]);

  useEffect(()=>{load();},[load]);

  async function save(e){
    e.preventDefault();
    if(!Number(form.amount))return;
    setBusy(true);setFeedback(null);
    try{
      const result=await projectOperationFinanceService.saveMovement({
        kind,projectId,date,contractorId:contractor.id,amount:form.amount,notes:form.notes,source:form.source,reference:form.reference,
      });
      onQueueChange?.(result.pendingCount||0);
      setFeedback({type:'success',text:result.status==='queued'?'حُفظت الحركة على الجهاز وتنتظر الاتصال.':`تم حفظ الحركة — ${receiptLabel(result.receipt)}`});
      setForm({amount:'',notes:'',source:'bank',reference:''});
      if(result.status==='verified')await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ الحركة: '+(e.message||e)});}
    setBusy(false);
  }

  const summary=summarizeProjectFinanceDay({advances,payments});
  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}><div><span>ADVANCES / PAYMENTS</span><h2>السلف والدفعات</h2><p>سجّل السلفة أو الدفعة للمقاول من نفس سياق المشروع واليوم.</p></div><strong>{money(summary.total)} <small>ر.س</small></strong></div>
      <Feedback value={feedback}/>
      <div className={styles.typeTabs}><button className={kind==='advance'?styles.typeOn:''} onClick={()=>setKind('advance')}>سلفة</button><button className={kind==='payment'?styles.typeOn:''} onClick={()=>setKind('payment')}>دفعة</button></div>
      <form className={styles.operationForm} onSubmit={save}>
        <label><span>المبلغ</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></label>
        {kind==='payment'&&<label><span>طريقة الدفع</span><select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))}>{Object.entries(PROJECT_FINANCE_SOURCE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
        {kind==='payment'&&<label><span>المرجع</span><input value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/></label>}
        <label><span>ملاحظة</span><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label>
        <button className={styles.primaryAction} disabled={busy}>{busy?'جارٍ الحفظ…':kind==='advance'?'حفظ السلفة':'حفظ الدفعة'}</button>
      </form>
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>حركة اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{summary.count}</b></div>
      <div className={styles.activityList}>
        {advances.map(row=><div className={styles.activityRow} key={`a-${row.id}`}><div><strong>سلفة</strong><small>{row.notes||'—'}</small></div><b>{money(row.amount)} ر.س</b></div>)}
        {payments.map(row=><div className={styles.activityRow} key={`p-${row.id}`}><div><strong>دفعة</strong><small>{row.notes||PROJECT_FINANCE_SOURCE_LABELS[row.source]||'—'}</small></div><b>{money(row.amount)} ر.س</b></div>)}
        {!advances.length&&!payments.length&&<PanelEmpty>لا توجد سلف أو دفعات لهذا اليوم.</PanelEmpty>}
      </div>
    </aside>
  </section>;
}
