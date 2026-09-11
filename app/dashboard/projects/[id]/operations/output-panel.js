'use client';

import { useCallback, useEffect, useState } from 'react';
import { projectOperationOutputService } from '@/lib/application/project-operation-output-service';
import { summarizeProjectOutput } from '@/lib/project-operation-output.mjs';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import styles from './operations.module.css';

const money=(n)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
function Feedback({value}){if(!value)return null;return <div className={value.type==='error'?styles.panelError:styles.panelSuccess}>{value.text}</div>;}
function PanelEmpty({children}){return <div className={styles.panelEmpty}>{children}</div>;}

export default function OutputPanel({projectId,date,contractor,onQueueChange}){
  const [items,setItems]=useState([]);
  const [availableItems,setAvailableItems]=useState([]);
  const [rows,setRows]=useState([]);
  const [form,setForm]=useState({item_id:'',qty:'',notes:''});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);

  const load=useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);setFeedback(null);
    try{
      const day=await projectOperationOutputService.loadDay({projectId,date,contractorId:contractor.id});
      setItems(day.items);
      setAvailableItems(day.availableItems);
      setRows(day.rows);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل إنجاز اليوم: '+(e.message||e)});}
    setLoading(false);
  },[projectId,date,contractor?.id]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    if(!availableItems.length)return;
    setForm((current)=>availableItems.some((item)=>item.id===current.item_id)?current:{...current,item_id:availableItems[0].id});
  },[availableItems]);

  async function save(e){
    e.preventDefault();
    const item=availableItems.find((candidate)=>candidate.id===form.item_id);
    if(!item||!Number(form.qty))return;
    setBusy(true);setFeedback(null);
    try{
      const result=await projectOperationOutputService.saveOutput({
        projectId,date,contractorId:contractor.id,item,quantity:form.qty,notes:form.notes,
      });
      onQueueChange?.(result.pendingCount||0);
      setFeedback({type:'success',text:result.status==='queued'?'حُفظ الإنجاز على هذا الجهاز وينتظر الاتصال.':`تم حفظ الإنجاز — ${receiptLabel(result.receipt)}`});
      setForm((current)=>({...current,qty:'',notes:''}));
      if(result.status==='verified')await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ الإنجاز: '+(e.message||e)});}
    setBusy(false);
  }

  const summary=summarizeProjectOutput(rows);
  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}>
        <div><span>DAILY OUTPUT</span><h2>الإنجاز اليومي</h2><p>سجّل الكمية المنفذة اليوم على البند المرتبط بالمقاول.</p></div>
        <strong>{rows.length}</strong>
      </div>
      <Feedback value={feedback}/>
      {loading?<PanelEmpty>جارٍ تحميل البنود…</PanelEmpty>:!availableItems.length?<PanelEmpty>لا توجد بنود متاحة لهذا المقاول في المشروع.</PanelEmpty>:<form className={styles.operationForm} onSubmit={save}>
        <label className={styles.wideField}><span>البند</span><select value={form.item_id} onChange={e=>setForm(f=>({...f,item_id:e.target.value}))}>{availableItems.map(item=><option key={item.id} value={item.id}>{item.description_ar} — {item.unit||'وحدة'}</option>)}</select></label>
        <label><span>الكمية المنفذة</span><input autoFocus required type="number" min="0" step="any" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></label>
        <label><span>ملاحظة</span><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label>
        <button className={styles.primaryAction} disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ الإنجاز'}</button>
      </form>}
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{money(summary.totalQuantity)}</b></div>
      <div className={styles.activityList}>{rows.length?rows.map(row=>{const item=items.find(x=>x.id===row.project_item_id);return <div className={styles.activityRow} key={row.id}><div><strong>{item?.description_ar||'بند'}</strong><small>{row.notes||'بدون ملاحظة'}</small></div><b>{money(row.group_output)} {row.unit||item?.unit||''}</b></div>}):<PanelEmpty>لا يوجد إنجاز مسجل لهذا المقاول اليوم.</PanelEmpty>}</div>
    </aside>
  </section>;
}
