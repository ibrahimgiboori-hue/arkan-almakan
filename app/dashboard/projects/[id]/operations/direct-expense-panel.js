'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { receiptLabel } from '@/lib/operation-safety.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import styles from './operations.module.css';

const CATEGORIES = ['وجبات','أجور','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','وقود ومحروقات','تأمين مسترد','تأمين طبي','ضيافة','أخرى'];
const PAYER_AR = { contractor:'المقاول', arkan_direct:'أركان مباشرة' };
const CHARGE_AR = { arkan:'أركان', contractor:'المقاول', owner:'المالك' };
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits:2 });

export default function DirectExpensePanel({ projectId, date, contractor, onQueueChange }){
  const [items,setItems] = useState([]);
  const [rows,setRows] = useState([]);
  const [form,setForm] = useState({ amount:'', notes:'', category:'مواد', payer:'contractor', charge_to:'arkan', is_recoverable:false, project_item_id:'' });
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [feedback,setFeedback] = useState(null);

  const load = useCallback(async()=>{
    if(!projectId||!date||!contractor?.id)return;
    setLoading(true);setFeedback(null);
    try{
      const [itemsQ,rowsQ]=await Promise.all([
        supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
        supabase.from('contractor_expenses').select('id,category,amount,notes,is_recoverable,payer,charge_to,project_item_id').eq('project_id',projectId).eq('contractor_id',contractor.id).eq('expense_date',date).neq('payer','arkan_custody').order('created_at'),
      ]);
      const error=[itemsQ,rowsQ].find(x=>x.error)?.error;if(error)throw error;
      setItems(itemsQ.data||[]);setRows(rowsQ.data||[]);
    }catch(e){setFeedback({type:'error',text:'تعذر تحميل مصروفات اليوم: '+(e.message||e)});}
    setLoading(false);
  },[projectId,date,contractor?.id]);
  useEffect(()=>{load()},[load]);

  async function save(e){
    e.preventDefault();
    if(!Number(form.amount)||!form.notes.trim())return;
    setBusy(true);setFeedback(null);
    try{
      const recoverable=form.payer==='arkan_direct'&&!!form.is_recoverable;
      const result=await saveOperationWithQueue({
        operation:'expense',projectId,workDate:date,
        payload:{
          contractor_id:contractor.id,
          amount:Number(form.amount),category:form.category,payer:form.payer,charge_to:form.charge_to,
          is_recoverable:recoverable,project_item_id:recoverable?null:(form.project_item_id||null),notes:form.notes.trim(),
        },
        batchId:null,sourceKind:'live',sourceRef:null,certainty:'confirmed',
      });
      onQueueChange?.(result.pendingCount||0);
      setFeedback({type:'success',text:result.status==='queued'?'حُفظ المصروف على الجهاز وينتظر الاتصال.':`تم حفظ المصروف — ${receiptLabel(result.receipt)}`});
      setForm(f=>({...f,amount:'',notes:'',project_item_id:''}));
      if(result.status==='verified')await load();
    }catch(e){setFeedback({type:'error',text:'تعذر حفظ المصروف: '+(e.message||e)});}
    setBusy(false);
  }

  const total=rows.reduce((sum,row)=>sum+Number(row.amount||0),0);

  return <section className={styles.operationGrid}>
    <main className={styles.formPane}>
      <div className={styles.panelTitle}>
        <div><span>DIRECT EXPENSES</span><h2>المصروفات</h2><p>هنا المصروفات التي دفعها المقاول أو دفعتها أركان مباشرة. الصرف من العهدة يُسجل من قسم «العهدة» فقط.</p></div>
        <strong>{money(total)} <small>ر.س</small></strong>
      </div>
      {feedback&&<div className={feedback.type==='error'?styles.panelError:styles.panelSuccess}>{feedback.text}</div>}
      {loading?<div className={styles.panelEmpty}>جارٍ تحميل مصروفات اليوم…</div>:<form className={styles.operationForm} onSubmit={save}>
        <label><span>المبلغ</span><input autoFocus required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></label>
        <label><span>التصنيف</span><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className={styles.wideField}><span>البيان</span><input required value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="مثال: بنزين سيارة الموقع"/></label>
        <label><span>من دفع؟</span><select value={form.payer} onChange={e=>{const payer=e.target.value;setForm(f=>({...f,payer,is_recoverable:payer==='contractor'?false:f.is_recoverable}))}}>{Object.entries(PAYER_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label><span>على من؟</span><select value={form.charge_to} onChange={e=>setForm(f=>({...f,charge_to:e.target.value}))}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        {form.payer==='arkan_direct'&&<label><span>طبيعة المبلغ</span><select value={form.is_recoverable?'1':'0'} onChange={e=>setForm(f=>({...f,is_recoverable:e.target.value==='1',project_item_id:e.target.value==='1'?'':f.project_item_id}))}><option value="0">مصروف نهائي</option><option value="1">قابل للاسترداد لأركان</option></select></label>}
        {!form.is_recoverable&&<label><span>البند إن كان مباشرًا</span><select value={form.project_item_id} onChange={e=>setForm(f=>({...f,project_item_id:e.target.value}))}><option value="">غير مرتبط ببند</option>{items.map(item=><option key={item.id} value={item.id}>{item.description_ar}</option>)}</select></label>}
        <button className={styles.primaryAction} disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ المصروف'}</button>
      </form>}
    </main>
    <aside className={styles.historyPane}>
      <div className={styles.historyHead}><div><span>مصروف اليوم</span><strong>{contractor?.name_ar}</strong></div><b>{money(total)} ر.س</b></div>
      <div className={styles.activityList}>{rows.length?rows.map(row=><div className={styles.activityRow} key={row.id}><div><strong>{row.category}</strong><small>{row.notes||PAYER_AR[row.payer]||'—'}</small></div><b>{money(row.amount)} ر.س</b></div>):<div className={styles.panelEmpty}>لا توجد مصروفات مباشرة لهذا المقاول اليوم.</div>}</div>
    </aside>
  </section>;
}
