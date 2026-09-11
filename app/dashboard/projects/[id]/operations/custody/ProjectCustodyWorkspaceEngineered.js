'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import { money, todayIsoInRiyadh } from '@/lib/format';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectCustodyService } from '@/lib/application/project-custody-service';
import {
  EMPTY_PROJECT_CUSTODY_OPEN_FORM,
  EMPTY_PROJECT_CUSTODY_TRANSACTION_FORM,
  PROJECT_CUSTODY_CHARGE_LABELS,
  PROJECT_CUSTODY_DIRECTION_LABELS,
  projectCustodyCanSettle,
  summarizeProjectCustodyTransactions,
} from '@/lib/project-custody.mjs';
import styles from './custody.module.css';

function onlineNow(){return typeof navigator==='undefined'||navigator.onLine!==false;}

export default function ProjectCustodyWorkspaceEngineered(){
  const {id:projectId}=useParams();
  const {date:operationDate,ready:contextReady}=useProjectOperationContext(projectId);
  const [custodies,setCustodies]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [transactions,setTransactions]=useState([]);
  const [employees,setEmployees]=useState({});
  const [employeeOptions,setEmployeeOptions]=useState([]);
  const [contractors,setContractors]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState(null);
  const [showOpen,setShowOpen]=useState(false);
  const [settleOpen,setSettleOpen]=useState(false);
  const [evidenceFile,setEvidenceFile]=useState(null);
  const [openingEvidenceFile,setOpeningEvidenceFile]=useState(null);
  const [evidenceKey,setEvidenceKey]=useState(0);
  const [openingEvidenceKey,setOpeningEvidenceKey]=useState(0);
  const [openForm,setOpenForm]=useState({...EMPTY_PROJECT_CUSTODY_OPEN_FORM,opened_at:todayIsoInRiyadh()});
  const [form,setForm]=useState({...EMPTY_PROJECT_CUSTODY_TRANSACTION_FORM,trx_date:todayIsoInRiyadh()});

  useEffect(()=>{
    if(!contextReady||!operationDate)return;
    setForm((current)=>({...current,trx_date:operationDate}));
    setOpenForm((current)=>({...current,opened_at:operationDate}));
  },[contextReady,operationDate]);

  const load=useCallback(async()=>{
    if(!projectId)return;
    setLoading(true);
    try{
      const workspace=await projectCustodyService.loadWorkspace({projectId});
      setCustodies(workspace.custodies);
      setEmployeeOptions(workspace.employeeOptions);
      setEmployees(workspace.employees);
      setContractors(workspace.contractors);
      setSelectedId((current)=>current&&workspace.custodies.some((row)=>row.id===current)?current:(workspace.custodies[0]?.id||''));
      setOpenForm((current)=>current.employee_id?current:{...current,employee_id:workspace.employeeOptions[0]?.id||''});
    }catch(error){
      setFeedback({type:'error',text:'تعذر تحميل العهد: '+(error?.message||error)});
    }
    setLoading(false);
  },[projectId]);

  const loadTransactions=useCallback(async()=>{
    if(!selectedId){setTransactions([]);return;}
    try{
      setTransactions(await projectCustodyService.loadTransactions({custodyId:selectedId}));
    }catch(error){
      setFeedback({type:'error',text:'تعذر تحميل حركات العهدة: '+(error?.message||error)});
    }
  },[selectedId]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{loadTransactions();},[loadTransactions]);

  const selected=useMemo(()=>custodies.find((row)=>row.id===selectedId)||null,[custodies,selectedId]);
  const totals=useMemo(()=>summarizeProjectCustodyTransactions(transactions),[transactions]);

  async function openEvidence(path){
    try{
      const url=await projectCustodyService.openEvidence(path);
      if(url)window.open(url,'_blank','noopener,noreferrer');
    }catch(error){setFeedback({type:'error',text:'تعذر فتح الإثبات: '+(error?.message||error)});}
  }

  async function openCustody(event){
    event.preventDefault();
    if(!openForm.employee_id)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await projectCustodyService.openCustody({
        projectId,
        form:openForm,
        evidenceFile:openingEvidenceFile,
        online:onlineNow(),
      });
      setSelectedId(result.custodyId);
      setShowOpen(false);
      setOpenForm((current)=>({...EMPTY_PROJECT_CUSTODY_OPEN_FORM,employee_id:current.employee_id,opened_at:operationDate||current.opened_at}));
      setOpeningEvidenceFile(null);setOpeningEvidenceKey((key)=>key+1);
      const issued=result.initialAmount>0?` وإصدار ${money(result.initialAmount)} ر.س`:'';
      setFeedback({type:result.evidenceWarning?'error':'success',text:`تم فتح العهدة ${result.custodyNo}${issued}.${result.evidenceWarning?` ${result.evidenceWarning}`:''}`});
      await load();
    }catch(error){setFeedback({type:'error',text:'تعذر فتح العهدة: '+(error?.message||error)});}
    setBusy(false);
  }

  async function saveTransaction(event){
    event.preventDefault();
    if(!selected||!Number(form.amount))return;
    setBusy(true);setFeedback(null);
    try{
      const result=await projectCustodyService.saveTransaction({
        projectId,
        custody:selected,
        form,
        evidenceFile,
        online:onlineNow(),
      });
      setFeedback({type:'success',text:`تم حفظ ${PROJECT_CUSTODY_DIRECTION_LABELS[form.direction]} بمبلغ ${money(form.amount)} ر.س والتحقق منها${result.proof?.document_path?' مع الإثبات':''}.`});
      setForm((current)=>({...current,amount:'',beneficiary:'',notes:'',trx_date:operationDate||current.trx_date}));
      setEvidenceFile(null);setEvidenceKey((key)=>key+1);
      await load();await loadTransactions();
    }catch(error){setFeedback({type:'error',text:'تعذر حفظ حركة العهدة: '+(error?.message||error)});}
    setBusy(false);
  }

  async function settle(){
    if(!selected||!projectCustodyCanSettle(selected))return;
    setBusy(true);setFeedback(null);
    try{
      await projectCustodyService.settle({custody:selected,online:onlineNow()});
      setFeedback({type:'success',text:'تمت تسوية العهدة.'});
      await load();
    }catch(error){
      setFeedback({type:'error',text:error?.message||String(error)});
      await load();
    }
    setSettleOpen(false);setBusy(false);
  }

  if(!contextReady||loading)return <div className={styles.empty}>جارٍ تحميل عهد المشروع…</div>;

  return <div className={styles.root} dir="rtl" data-project-custody-workspace="engineered-v1">
    <header className={styles.head}>
      <div><span>PROJECT CUSTODY</span><h2>العهدة</h2><p>رصيد فعلي وحركات إصدار وصرف وإرجاع داخل المشروع · تاريخ التشغيل {operationDate}</p></div>
      <div className={styles.headerActions}>
        {custodies.length>0&&<select value={selectedId} onChange={(event)=>setSelectedId(event.target.value)}>{custodies.map((custody)=><option key={custody.id} value={custody.id}>{custody.custody_no} — {employees[custody.employee_id]||'موظف'}</option>)}</select>}
        <button type="button" onClick={()=>setShowOpen((value)=>!value)}>{showOpen?'إلغاء':'فتح عهدة جديدة'}</button>
      </div>
    </header>

    {feedback&&<div className={feedback.type==='error'?styles.error:styles.success}>{feedback.text}</div>}

    {showOpen&&<section className={styles.openCard}>
      <div className={styles.sectionTitle}><div><span>NEW CUSTODY</span><h3>فتح عهدة للمشروع</h3></div><small>الترقيم والحركة الأولى ينفذان كعملية واحدة.</small></div>
      <form className={styles.form} onSubmit={openCustody}>
        <label><span>صاحب العهدة</span><select required value={openForm.employee_id} onChange={(event)=>setOpenForm((current)=>({...current,employee_id:event.target.value}))}><option value="">اختر الموظف</option>{employeeOptions.map((employee)=><option key={employee.id} value={employee.id}>{employee.full_name_ar}{employee.employee_no?` — ${employee.employee_no}`:''}</option>)}</select></label>
        <label><span>تاريخ الفتح</span><input type="date" value={openForm.opened_at} onChange={(event)=>setOpenForm((current)=>({...current,opened_at:event.target.value}))}/></label>
        <label><span>المبلغ الأولي</span><input type="number" min="0" step="0.01" value={openForm.initial_amount} onChange={(event)=>setOpenForm((current)=>({...current,initial_amount:event.target.value}))} placeholder="0.00"/></label>
        <label className={styles.wide}><span>الغرض من العهدة</span><input value={openForm.purpose} onChange={(event)=>setOpenForm((current)=>({...current,purpose:event.target.value}))} placeholder="مثال: مصاريف تشغيل الموقع"/></label>
        <label className={styles.fileField}><span>إثبات الإصدار الأولي</span><input key={openingEvidenceKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event)=>setOpeningEvidenceFile(event.target.files?.[0]||null)}/><small>يُرفع الملف الأصلي دون ضغط.</small></label>
        <button className={styles.primary} disabled={busy||!openForm.employee_id}>{busy?'جارٍ الفتح…':'فتح العهدة'}</button>
      </form>
    </section>}

    {!custodies.length?<div className={styles.empty}><strong>لا توجد عهدة مرتبطة بهذا المشروع.</strong><span>استخدم «فتح عهدة جديدة» لبدء رصيد عهدة المشروع.</span></div>:selected&&<>
      <section className={styles.summary}>
        <div><span>صاحب العهدة</span><strong>{employees[selected.employee_id]||'—'}</strong><small>{selected.custody_no}</small></div>
        <div><span>إجمالي الإصدار</span><strong>{money(totals.issued)}</strong><small>ر.س</small></div>
        <div><span>المصروف</span><strong>{money(totals.spent)}</strong><small>ر.س</small></div>
        <div><span>المعاد</span><strong>{money(totals.returned)}</strong><small>ر.س</small></div>
        <div className={styles.balance}><span>الرصيد المتبقي</span><strong>{money(selected.balance)}</strong><small>ر.س</small></div>
      </section>

      <section className={styles.grid}>
        <main className={styles.formPane}>
          <div className={styles.sectionTitle}><div><span>NEW MOVEMENT</span><h3>حركة عهدة</h3></div>{projectCustodyCanSettle(selected)&&<button type="button" onClick={()=>setSettleOpen(true)} disabled={busy}>تسوية العهدة</button>}</div>
          <form onSubmit={saveTransaction} className={styles.form}>
            <label><span>نوع الحركة</span><select value={form.direction} onChange={(event)=>setForm((current)=>({...current,direction:event.target.value}))}><option value="spend">صرف من العهدة</option><option value="issue">تعزيز العهدة</option><option value="return">إرجاع متبقي</option></select></label>
            <label><span>التاريخ</span><input type="date" value={form.trx_date} onChange={(event)=>setForm((current)=>({...current,trx_date:event.target.value}))}/></label>
            <label><span>المبلغ</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event)=>setForm((current)=>({...current,amount:event.target.value}))}/></label>
            {form.direction==='spend'&&<>
              <label><span>التصنيف</span><input value={form.category} onChange={(event)=>setForm((current)=>({...current,category:event.target.value}))}/></label>
              <label className={styles.wide}><span>البيان / المستفيد</span><input required value={form.beneficiary} onChange={(event)=>setForm((current)=>({...current,beneficiary:event.target.value}))} placeholder="مثال: إيجار معدات الموقع"/></label>
              <label><span>على من؟</span><select value={form.charge_to} onChange={(event)=>setForm((current)=>({...current,charge_to:event.target.value,contractor_id:event.target.value==='contractor'?current.contractor_id:''}))}>{Object.entries(PROJECT_CUSTODY_CHARGE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
              {form.charge_to==='contractor'&&<label><span>المقاول</span><select required value={form.contractor_id} onChange={(event)=>setForm((current)=>({...current,contractor_id:event.target.value}))}><option value="">اختر المقاول</option>{contractors.map((contractor)=><option key={contractor.id} value={contractor.id}>{contractor.operation_alias||contractor.name_ar}</option>)}</select></label>}
            </>}
            <label className={styles.wide}><span>ملاحظة</span><input value={form.notes} onChange={(event)=>setForm((current)=>({...current,notes:event.target.value}))} placeholder="اختياري"/></label>
            <label className={styles.fileField}><span>الإثبات</span><input key={evidenceKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event)=>setEvidenceFile(event.target.files?.[0]||null)}/><small>فاتورة، سند أو صورة أصلية بدون ضغط.</small></label>
            <button className={styles.primary} disabled={busy||selected.status!=='open'}>{busy?'جارٍ الحفظ…':'حفظ الحركة'}</button>
          </form>
          <div className={styles.purpose}><span>الغرض من العهدة</span><p>{selected.purpose||'غير محدد'}</p><small>افتتحت في {selected.opened_at} · الحالة: {selected.status==='open'?'مفتوحة':selected.status==='settled'?'مسوّاة':'مغلقة'}</small></div>
        </main>

        <aside className={styles.history}>
          <div className={styles.historyHead}><div><span>LEDGER</span><h3>سجل الحركات</h3></div><strong>{transactions.length}</strong></div>
          <div className={styles.list}>{transactions.map((row)=><div className={styles.row} key={row.id}>
            <div className={styles.rowMain}><span className={`${styles.dot} ${styles[`dot_${row.direction}`]||''}`}></span><div><strong>{PROJECT_CUSTODY_DIRECTION_LABELS[row.direction]||row.direction}</strong><small>{row.category||row.beneficiary||row.notes||'—'} · {row.trx_date}</small></div></div>
            <div className={styles.rowActions}>
              {row.document_path&&<button className={styles.evidenceButton} type="button" onClick={()=>openEvidence(row.document_path)}>الإثبات</button>}
              <div className={styles.rowAmount}><strong>{money(row.amount)}</strong><small>{row.charge_to?PROJECT_CUSTODY_CHARGE_LABELS[row.charge_to]:'ر.س'}</small></div>
            </div>
          </div>)}</div>
        </aside>
      </section>
    </>}

    {settleOpen&&<ConstitutionDialog title="تسوية العهدة" description="سيتم تغيير حالة العهدة إلى «مسوّاة». لا تُنفذ العملية إلا إذا كان الرصيد صفرًا." size="compact" onClose={()=>!busy&&setSettleOpen(false)}>
      <div style={{display:'flex',gap:8,justifyContent:'flex-start'}}>
        <button type="button" className={styles.primary} disabled={busy} onClick={settle}>{busy?'جارٍ التسوية…':'تأكيد التسوية'}</button>
        <button type="button" disabled={busy} onClick={()=>setSettleOpen(false)}>إلغاء</button>
      </div>
    </ConstitutionDialog>}
  </div>;
}
