'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import { money, todayIsoInRiyadh } from '@/lib/format';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectLedgerMatches } from '@/lib/project-operation-context.mjs';
import ProjectLedgerFilterBar from '@/components/project/ProjectLedgerFilterBar';
import { projectCustodyService } from '@/lib/application/project-custody-service';
import {
  EMPTY_PROJECT_CUSTODY_OPEN_FORM,
  PROJECT_CUSTODY_CHARGE_LABELS,
  PROJECT_CUSTODY_DIRECTION_LABELS,
  createCustodyDraft,
  custodyInflow,
  custodyOutflow,
  projectCustodyCanSettle,
  storedCustodyTransactionRow,
  summarizeProjectCustodyTransactions,
  validateCustodyDrafts,
} from '@/lib/project-custody.mjs';
import { saveSheetRows, sheetBatchMessage } from '@/lib/sheet-batch.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from './custody.module.css';

const options=(labels)=>Object.entries(labels).map(([value,label])=>({value,label}));
const EVIDENCE_TYPES='application/pdf,image/jpeg,image/png,image/webp';

function onlineNow(){return typeof navigator==='undefined'||navigator.onLine!==false;}

/**
 * العهدة كدفتر إكسل: حركات العهدة المحفوظة مقفلة بعمودي وارد ومنصرف وإجماليهما،
 * والحركات الجديدة تُكتب أو تُلصق تحتها (كل صف بإثباته) ثم تُحفظ مرة واحدة.
 */
export default function ProjectCustodyWorkspaceEngineered({service=projectCustodyService}={}){
  const {id:projectId}=useParams();
  const operationContext=useProjectOperationContext(projectId);
  const {date:operationDate,from,to,search,ready:contextReady}=operationContext;
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
  const [openingEvidenceFile,setOpeningEvidenceFile]=useState(null);
  const [openingEvidenceKey,setOpeningEvidenceKey]=useState(0);
  const [openForm,setOpenForm]=useState({...EMPTY_PROJECT_CUSTODY_OPEN_FORM,opened_at:todayIsoInRiyadh()});
  const [drafts,setDrafts]=useState(()=>[1,2,3].map(()=>createCustodyDraft(todayIsoInRiyadh())));

  useEffect(()=>{
    if(!contextReady||!operationDate)return;
    setDrafts((current)=>current.map((row)=>row.amount||row.beneficiary||row.notes?row:{...row,trx_date:operationDate}));
    setOpenForm((current)=>({...current,opened_at:operationDate}));
  },[contextReady,operationDate]);

  const load=useCallback(async()=>{
    if(!projectId)return;
    setLoading(true);
    try{
      const workspace=await service.loadWorkspace({projectId});
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
  },[projectId,service]);

  const loadTransactions=useCallback(async()=>{
    if(!selectedId){setTransactions([]);return;}
    try{
      setTransactions(await service.loadTransactions({custodyId:selectedId}));
    }catch(error){
      setFeedback({type:'error',text:'تعذر تحميل حركات العهدة: '+(error?.message||error)});
    }
  },[selectedId,service]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setDrafts([1,2,3].map(()=>createCustodyDraft(operationDate||todayIsoInRiyadh())));},[selectedId]);
  useEffect(()=>{loadTransactions();},[loadTransactions]);

  const selected=useMemo(()=>custodies.find((row)=>row.id===selectedId)||null,[custodies,selectedId]);
  const totals=useMemo(()=>summarizeProjectCustodyTransactions(transactions),[transactions]);

  async function openEvidence(path){
    try{
      const url=await service.openEvidence(path);
      if(url)window.open(url,'_blank','noopener,noreferrer');
    }catch(error){setFeedback({type:'error',text:'تعذر فتح الإثبات: '+(error?.message||error)});}
  }

  async function openCustody(event){
    event.preventDefault();
    if(!openForm.employee_id)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await service.openCustody({
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

  // One continuous custody ledger: the shared period and search decide which saved movements show.
  const savedRows=useMemo(()=>[...transactions].reverse().map(storedCustodyTransactionRow)
    .filter((row)=>(!from||row.trx_date>=from)&&(!to||row.trx_date<=to))
    .filter((row)=>projectLedgerMatches(search,row.category,row.beneficiary,row.notes,PROJECT_CUSTODY_DIRECTION_LABELS[row.direction])),[transactions,from,to,search]);
  const rows=useMemo(()=>[...savedRows,...drafts],[savedRows,drafts]);
  const {ready,errors}=validateCustodyDrafts(rows);
  const blank=()=>createCustodyDraft(operationDate||todayIsoInRiyadh());

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>({...blank(),...patch}))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):[blank()]);}

  async function saveSheet(){
    if(!selected)return;
    if(errors.length){setFeedback({type:'error',text:errors.slice(0,4).join(' ')});return;}
    if(!ready.length)return;
    setBusy(true);setFeedback(null);
    try{
      const result=await saveSheetRows(ready,async(row)=>{
        const saved=await service.saveTransaction({projectId,custody:selected,form:row,evidenceFile:row.evidenceFile||null,online:onlineNow()});
        return {...saved,status:'verified'};
      });
      const done=new Set(result.saved.map((entry)=>entry.row._id));
      setDrafts((prev)=>{
        const next=prev.filter((row)=>!done.has(row._id));
        return next.length>=2?next:[...next,...[1,2].slice(next.length).map(blank)];
      });
      setFeedback({type:result.failure?'error':'success',text:sheetBatchMessage(result,'حركة عهدة')});
      if(result.saved.length){await load();await loadTransactions();}
    }catch(error){setFeedback({type:'error',text:'تعذر حفظ حركات العهدة: '+(error?.message||error)});}
    setBusy(false);
  }

  async function settle(){
    if(!selected||!projectCustodyCanSettle(selected))return;
    setBusy(true);setFeedback(null);
    try{
      await service.settle({custody:selected,online:onlineNow()});
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

      <ProjectLedgerFilterBar context={operationContext} showContractor={false} searchPlaceholder="البيان أو المستفيد أو التصنيف"/>

      <section className={styles.sheetHead}>
        <div className={styles.sectionTitle}>
          <div><span>CUSTODY LEDGER · SHEET</span><h3>دفتر العهدة</h3><small>{selected.purpose||'غرض غير محدد'} · افتتحت في {selected.opened_at} · {selected.status==='open'?'مفتوحة':selected.status==='settled'?'مسوّاة':'مغلقة'} · يظهر {savedRows.length} من {transactions.length} حركة في الفترة المختارة</small></div>
          {projectCustodyCanSettle(selected)&&<button type="button" onClick={()=>setSettleOpen(true)} disabled={busy}>تسوية العهدة</button>}
        </div>
      </section>

      <RawGrid
        columns={[
          {key:'_index',label:'#',type:'index',render:(row)=>rows.indexOf(row)+1},
          {key:'_status',label:'الحالة',type:'badge',text:(row)=>row.persisted?'محفوظ':'جديد',tone:(row)=>row.persisted?'saved':'new'},
          {key:'direction',label:'نوع الحركة',type:'select',minWidth:150,options:options(PROJECT_CUSTODY_DIRECTION_LABELS),
            onChange:(row,value)=>({direction:value,...(value==='spend'?{}:{charge_to:'arkan',contractor_id:''})})},
          {key:'trx_date',label:'التاريخ',type:'date'},
          {key:'amount',label:'المبلغ',type:'number',min:0,step:0.01},
          {key:'_in',label:'وارد',type:'computed',numeric:true,formula:'المبلغ إذا كانت الحركة تعزيزًا للعهدة',compute:custodyInflow,format:(value)=>value===null?null:money(value),total:'sum'},
          {key:'_out',label:'منصرف',type:'computed',numeric:true,formula:'المبلغ إذا كانت الحركة صرفًا أو إرجاعًا',compute:custodyOutflow,format:(value)=>value===null?null:money(value),total:'sum'},
          {key:'category',label:'التصنيف',type:'text',minWidth:130,visible:(row)=>row.direction==='spend'},
          {key:'beneficiary',label:'البيان / المستفيد',type:'text',minWidth:200,visible:(row)=>row.direction==='spend',placeholder:'مثال: إيجار معدات الموقع'},
          {key:'charge_to',label:'على من؟',type:'select',minWidth:110,visible:(row)=>row.direction==='spend',options:options(PROJECT_CUSTODY_CHARGE_LABELS),
            onChange:(row,value)=>({charge_to:value,contractor_id:value==='contractor'?row.contractor_id:''})},
          {key:'contractor_id',label:'المقاول',type:'select',minWidth:170,emptyOption:'اختر المقاول',visible:(row)=>row.direction==='spend'&&row.charge_to==='contractor',
            options:contractors.map((contractor)=>({value:contractor.id,label:contractor.operation_alias||contractor.name_ar}))},
          {key:'notes',label:'ملاحظة',type:'text',minWidth:160,placeholder:'اختياري'},
          {key:'_evidence',label:'الإثبات',type:'custom',minWidth:150,render:(row,{disabled})=>row.persisted
            ?(row.document_path?<button className={styles.evidenceButton} type="button" onClick={()=>openEvidence(row.document_path)}>الإثبات</button>:<span aria-hidden="true">—</span>)
            :<label className={styles.evidencePick} title="فاتورة، سند أو صورة أصلية بدون ضغط">
              <input type="file" accept={EVIDENCE_TYPES} disabled={disabled} onChange={(event)=>patchRow(row._id,{evidenceFile:event.target.files?.[0]||null})}/>
              <span>{row.evidenceFile?row.evidenceFile.name:'إرفاق'}</span>
            </label>},
          {key:'_action',label:'إجراء',type:'action',render:(row,{disabled})=>row.persisted
            ?<span aria-hidden="true">—</span>
            :<button type="button" className={rawGridStyles.actionButton} onClick={()=>removeRow(row)} disabled={disabled}>×</button>},
        ]}
        rows={rows}
        rowKey={(row)=>row._id}
        savedFlag={(row)=>row.persisted}
        rowDisabled={(row)=>row.persisted||selected.status!=='open'}
        onPatchRow={patchRow}
        onAppendRows={appendRows}
        busy={busy}
      />

      <RawGridFooter
        actions={<>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...[1,2,3].map(blank)])} disabled={busy||selected.status!=='open'}>+ 3 صفوف</button>
          <button type="button" className={rawGridStyles.plainButton} onClick={()=>{setDrafts([1,2,3].map(blank));loadTransactions();}} disabled={busy}>إعادة تحميل الدفتر</button>
        </>}
        summary={<>
          <strong>{selected.status!=='open'?'العهدة غير مفتوحة — الدفتر للقراءة':`جاهز للحفظ: ${ready.length} حركة${errors.length?` · ${errors.length} ناقصة`:''}`}</strong>
          <button className={rawGridStyles.primaryButton} type="button" onClick={saveSheet} disabled={busy||selected.status!=='open'||(!ready.length&&!errors.length)}>{busy?'جارٍ الحفظ…':'حفظ حركات العهدة'}</button>
        </>}
      />
    </>}

    {settleOpen&&<ConstitutionDialog title="تسوية العهدة" description="سيتم تغيير حالة العهدة إلى «مسوّاة». لا تُنفذ العملية إلا إذا كان الرصيد صفرًا." size="compact" onClose={()=>!busy&&setSettleOpen(false)}>
      <div style={{display:'flex',gap:8,justifyContent:'flex-start'}}>
        <button type="button" className={styles.primary} disabled={busy} onClick={settle}>{busy?'جارٍ التسوية…':'تأكيد التسوية'}</button>
        <button type="button" disabled={busy} onClick={()=>setSettleOpen(false)}>إلغاء</button>
      </div>
    </ConstitutionDialog>}
  </div>;
}
