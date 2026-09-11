'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import { todayIsoInRiyadh } from '@/lib/format';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectLaborService } from '@/lib/application/project-labor-service';
import {
  EMPTY_PROJECT_LABOR_QUICK_ADD,
  PROJECT_LABOR_CLASS,
  PROJECT_LABOR_PAY_BASIS,
  projectLaborSuggestedDailyRate,
} from '@/lib/project-labor.mjs';
import styles from '../operations.module.css';

function dateLabel(value){
  if(!value)return '—';
  const [y,m,d]=String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
}

export default function ProjectLaborWorkspaceEngineered(){
  const {id:projectId}=useParams();
  const {date,contractorId,ready:contextReady,setDate,setContractorId}=useProjectOperationContext(projectId);

  const [contractors,setContractors]=useState([]);
  const [roster,setRoster]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');
  const [quickAddOpen,setQuickAddOpen]=useState(false);
  const [quickAddForm,setQuickAddForm]=useState({...EMPTY_PROJECT_LABOR_QUICK_ADD});
  const [quickAddResults,setQuickAddResults]=useState([]);
  const [editFor,setEditFor]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [moveFor,setMoveFor]=useState(null);
  const [moveForm,setMoveForm]=useState({contractor_id:'',effective_from:'',daily_rate:'',notes:''});

  const load=useCallback(async()=>{
    if(!contextReady||!projectId||!date)return;
    setLoading(true);setLoadError('');setErr('');
    try{
      const workspace=await projectLaborService.loadWorkspace({projectId,date});
      setContractors(workspace.contractors);
      setRoster(workspace.roster);
      const selectedStillExists=contractorId&&workspace.contractors.some((row)=>row.id===contractorId);
      if(!selectedStillExists)setContractorId(workspace.contractors[0]?.id||'');
    }catch(error){
      const message='تعذر تحميل عمالة المشروع: '+(error.message||error);
      setLoadError(message);setErr(message);setContractors([]);setRoster([]);
    }
    setLoading(false);
  },[contextReady,date,projectId,contractorId,setContractorId]);

  useEffect(()=>{load();},[load]);

  const selectedContractor=contractors.find((row)=>row.id===contractorId)||null;
  const contractorRoster=useMemo(()=>roster.filter((worker)=>worker.contractor_id===contractorId),[contractorId,roster]);
  const projectWorkers=useMemo(()=>contractorRoster.filter((worker)=>worker.current_assignment?.project_id===projectId),[contractorRoster,projectId]);

  function suggestedDailyRate(laborClass='worker'){
    return projectLaborSuggestedDailyRate(selectedContractor,laborClass);
  }

  function openQuickAdd(){
    setQuickAddResults([]);
    setQuickAddForm({...EMPTY_PROJECT_LABOR_QUICK_ADD,daily_rate:suggestedDailyRate('worker'),effective_from:date});
    setQuickAddOpen(true);setErr('');setMsg('');
  }

  function changeQuickLaborClass(laborClass){
    setQuickAddForm((form)=>({...form,labor_class:laborClass,daily_rate:form.pay_basis==='daily'?suggestedDailyRate(laborClass):form.daily_rate}));
  }

  async function saveQuickAdd(event){
    event.preventDefault();
    if(!selectedContractor)return;
    const effectiveFrom=quickAddForm.effective_from||date;
    setBusy('quick-add');setErr('');setMsg('');setQuickAddResults([]);
    try{
      const result=await projectLaborService.quickAdd({
        projectId,contractorId:selectedContractor.id,effectiveFrom,form:quickAddForm,today:todayIsoInRiyadh(),
      });
      setQuickAddResults(result.results);
      const parts=[];
      if(result.summary.created)parts.push(`أُضيف ${result.summary.created}`);
      if(result.summary.existing)parts.push(`أُسند ${result.summary.existing} موجود`);
      if(result.summary.transfers)parts.push(`${result.summary.transfers} يحتاج نقلًا صريحًا`);
      setMsg(parts.length?`${parts.join('، ')}. تاريخ الإسناد: ${effectiveFrom}.`:'لم تُنشأ سجلات جديدة.');
      await load();
      if(!result.summary.transfers){setQuickAddOpen(false);setQuickAddForm({...EMPTY_PROJECT_LABOR_QUICK_ADD});}
    }catch(error){setErr('تعذر إضافة العمالة: '+(error.message||error));}
    setBusy('');
  }

  async function transferQuickCandidate(candidate){
    if(!candidate?.laborer_id||!selectedContractor)return;
    const key=`quick-transfer:${candidate.laborer_id}`;
    setBusy(key);setErr('');setMsg('');
    try{
      const effectiveFrom=quickAddForm.effective_from||date;
      const worker=await projectLaborService.transferQuickCandidate({candidate,selectedContractor,projectId,effectiveFrom});
      setQuickAddResults((rows)=>rows.map((row)=>row.laborer_id===candidate.laborer_id?{...row,status:'transferred'}:row));
      setMsg(`تم نقل ${worker.full_name} إلى المقاول والمشروع اعتبارًا من ${effectiveFrom} مع حفظ تاريخه السابق.`);
      await load();
    }catch(error){setErr('تعذر نقل العامل: '+(error.message||error));}
    setBusy('');
  }

  async function assignWorker(worker){
    if(!selectedContractor)return;
    const otherAssignment=worker.current_assignment&&worker.current_assignment.project_id!==projectId;
    const key=`${otherAssignment?'move-in':'assign'}:${worker.id}`;
    setBusy(key);setErr('');setMsg('');
    try{
      const result=await projectLaborService.assignWorker({worker,projectId,contractorId:selectedContractor.id,effectiveFrom:date});
      setMsg(result.moved?`نُقل ${worker.full_name} إلى المشروع.`:`أُسند ${worker.full_name} للمشروع.`);
      await load();
    }catch(error){setErr(error.message||String(error));}
    setBusy('');
  }

  function rateForTarget(targetId,worker=moveFor){
    const target=contractors.find((row)=>row.id===targetId);
    return worker?.pay_basis==='daily'?projectLaborSuggestedDailyRate(target,worker.labor_class):'';
  }

  function openEdit(worker){
    setEditFor(worker);
    setEditForm({
      full_name:worker.full_name||'',labor_class:worker.labor_class||'worker',trade:worker.trade||'',pay_basis:worker.pay_basis||'daily',
      daily_rate:worker.daily_rate||'',monthly_salary:worker.monthly_salary||'',salary_days:worker.salary_days||30,piece_rate:worker.piece_rate||'',piece_unit:worker.piece_unit||'م2',
      valid_from:worker.assignment_from||date,valid_to:worker.assignment_to||'',reason:'',
    });
  }

  async function saveEdit(event){
    event.preventDefault();
    if(!editFor)return;
    setBusy('edit');setErr('');setMsg('');
    try{
      await projectLaborService.updateWorker({worker:editFor,form:editForm});
      setMsg(`حُفظ تعديل ${editForm.full_name}.`);setEditFor(null);await load();
    }catch(error){setErr('تعذر تعديل العامل: '+(error.message||error));}
    setBusy('');
  }

  function openMove(worker){setMoveFor(worker);setMoveForm({contractor_id:'',effective_from:date,daily_rate:'',notes:''});}
  function changeMoveContractor(targetId){setMoveForm((form)=>({...form,contractor_id:targetId,daily_rate:rateForTarget(targetId,moveFor)}));}

  async function saveMove(event){
    event.preventDefault();
    if(!moveFor||!moveForm.contractor_id)return;
    setBusy('move');setErr('');setMsg('');
    try{
      await projectLaborService.moveWorker({
        worker:moveFor,projectId,contractorId:moveForm.contractor_id,effectiveFrom:moveForm.effective_from||date,
        dailyRate:moveForm.daily_rate,notes:moveForm.notes||'نقل من إدارة عمالة المشروع',
      });
      const movedName=moveFor.full_name;
      setMoveFor(null);setContractorId(moveForm.contractor_id);setMsg(`تم نقل ${movedName} مع حفظ تاريخه السابق.`);await load();
    }catch(error){setErr('تعذر نقل العامل: '+(error.message||error));}
    setBusy('');
  }

  if(!contextReady||loading)return <div className={styles.loading}>جارٍ فتح عمالة المشروع…</div>;

  return <div className={styles.root} dir="rtl" data-canonical-labor-entry="project-labor">
    <section className={styles.controlBar}>
      <div className={styles.modeTitle}><span>التشغيل اليومي</span><strong>العمالة</strong></div>
      <div className={styles.dateNav} aria-label="تاريخ إسناد العمالة">
        <button type="button" onClick={()=>setDate((current)=>moveOperationalDate(current,1))} aria-label="اليوم التالي">←</button>
        <div className={styles.dateCenter}><strong>{dateLabel(date)}</strong><input aria-label="اختيار تاريخ إسناد العمالة" type="date" value={date} onChange={(event)=>setDate(event.target.value)}/></div>
        <button type="button" onClick={()=>setDate((current)=>moveOperationalDate(current,-1))} aria-label="اليوم السابق">→</button>
      </div>
      <button type="button" className={styles.todayButton} onClick={()=>setDate(todayIsoInRiyadh())}>اليوم</button>
    </section>

    {err&&<div className={styles.error}>{err}</div>}
    {msg&&<div className={styles.success}>{msg}</div>}

    {loadError?null:<>
      <section className={styles.summaryStrip}>
        <div><span>عمالة المقاول</span><strong>{contractorRoster.length}</strong></div>
        <div><span>مسندة للمشروع</span><strong>{projectWorkers.length}</strong></div>
        <div><span>عمال</span><strong>{projectWorkers.filter((worker)=>worker.labor_class==='worker').length}</strong></div>
        <div><span>صنايعية</span><strong>{projectWorkers.filter((worker)=>worker.labor_class==='technician').length}</strong></div>
      </section>

      <section className={styles.contractorBar}>
        <div className={styles.contractorTabs}>
          {contractors.map((contractor)=><button key={contractor.id} type="button" className={contractorId===contractor.id?styles.activeContractor:''} onClick={()=>setContractorId(contractor.id)}><span>{contractor.operation_alias||contractor.name_ar}</span><small>{roster.filter((worker)=>worker.contractor_id===contractor.id&&worker.current_assignment?.project_id===projectId).length} مسند</small></button>)}
        </div>
        <div className={styles.contractorMeta}><strong>{selectedContractor?.name_ar||'—'}</strong><span>{date}</span></div>
      </section>

      {!selectedContractor?<div className={styles.empty}>لا يوجد مقاول مسند للمشروع في التاريخ المختار.</div>:<section className={styles.operationGrid}>
        <main className={styles.formPane}>
          <div className={styles.panelTitle}>
            <div><h2>عمالة المقاول</h2><small>الإضافة الجديدة تتم من هنا فقط حتى يبقى المشروع والمقاول وتاريخ الإسناد جزءًا واحدًا من العملية.</small></div>
            <button type="button" className="btn" onClick={openQuickAdd}>إضافة عمالة</button>
          </div>
          <div className={styles.activityList}>
            {contractorRoster.length===0?<div className={styles.panelEmpty}><div>لا توجد عمالة لدى هذا المقاول.</div><button type="button" className="btn" onClick={openQuickAdd} style={{marginTop:10}}>إضافة أول عمالة هنا</button></div>:contractorRoster.map((worker)=>{
              const inThisProject=worker.current_assignment?.project_id===projectId;
              const assignedElsewhere=Boolean(worker.current_assignment&&!inThisProject);
              const actionKey=`${assignedElsewhere?'move-in':'assign'}:${worker.id}`;
              return <div className={styles.activityRow} key={worker.id}>
                <div><strong>{worker.full_name}</strong><small>{PROJECT_LABOR_CLASS[worker.labor_class]||worker.labor_class} · {worker.trade||'—'} · {PROJECT_LABOR_PAY_BASIS[worker.pay_basis]||worker.pay_basis}</small></div>
                <div>{inThisProject?<span className="pill ok">مسند</span>:<button type="button" className="btn" disabled={busy===actionKey} onClick={()=>assignWorker(worker)}>{busy===actionKey?'جارٍ التنفيذ…':assignedElsewhere?'نقل للمشروع':'إسناد'}</button>}</div>
              </div>;
            })}
          </div>
        </main>

        <aside className={styles.historyPane}>
          <div className={styles.historyHead}><div><strong>في المشروع</strong></div><b>{projectWorkers.length}</b></div>
          <div className={styles.activityList}>{projectWorkers.length===0?<div className={styles.panelEmpty}>لا توجد عمالة مسندة.</div>:projectWorkers.map((worker)=><div className={styles.activityRow} key={worker.id}><div><strong>{worker.full_name}</strong><small>{PROJECT_LABOR_CLASS[worker.labor_class]||worker.labor_class} · {worker.trade||'—'} · {PROJECT_LABOR_PAY_BASIS[worker.pay_basis]||worker.pay_basis}</small></div><div><button type="button" className="btn ghost" onClick={()=>openEdit(worker)}>تعديل</button> <button type="button" className="btn ghost" onClick={()=>openMove(worker)}>نقل</button></div></div>)}</div>
        </aside>
      </section>}
    </>}

    {quickAddOpen&&<ConstitutionDialog title={`إضافة عمالة — ${selectedContractor?.name_ar||''}`} size="wide" onClose={()=>{setQuickAddOpen(false);setQuickAddResults([]);}}>
      <form className={styles.operationForm} onSubmit={saveQuickAdd} data-canonical-labor-create-form="true">
        <label className={styles.wideField}><span>الأسماء *</span><textarea required rows="6" value={quickAddForm.names} onChange={(event)=>setQuickAddForm((form)=>({...form,names:event.target.value}))} placeholder={'اكتب كل اسم في سطر مستقل\nيمكن أيضًا الفصل بفاصلة'}/></label>
        <label><span>الصفة</span><select value={quickAddForm.labor_class} onChange={(event)=>changeQuickLaborClass(event.target.value)}>{Object.entries(PROJECT_LABOR_CLASS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>المهنة</span><input value={quickAddForm.trade} onChange={(event)=>setQuickAddForm((form)=>({...form,trade:event.target.value}))}/></label>
        <label><span>طريقة الأجر</span><select value={quickAddForm.pay_basis} onChange={(event)=>setQuickAddForm((form)=>({...form,pay_basis:event.target.value}))}>{Object.entries(PROJECT_LABOR_PAY_BASIS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {quickAddForm.pay_basis==='daily'&&<label><span>اليومية</span><input type="number" min="0" step="0.01" value={quickAddForm.daily_rate} onChange={(event)=>setQuickAddForm((form)=>({...form,daily_rate:event.target.value}))}/><small>تُقترح تلقائيًا من اتفاق المقاول ويمكن تعديلها قبل الحفظ.</small></label>}
        {quickAddForm.pay_basis==='salary'&&<><label><span>الراتب الشهري</span><input type="number" min="0" step="0.01" value={quickAddForm.monthly_salary} onChange={(event)=>setQuickAddForm((form)=>({...form,monthly_salary:event.target.value}))}/></label><label><span>أيام الاحتساب</span><input type="number" min="1" value={quickAddForm.salary_days} onChange={(event)=>setQuickAddForm((form)=>({...form,salary_days:event.target.value}))}/></label></>}
        {quickAddForm.pay_basis==='piecework'&&<><label><span>سعر الوحدة</span><input type="number" min="0" step="0.01" value={quickAddForm.piece_rate} onChange={(event)=>setQuickAddForm((form)=>({...form,piece_rate:event.target.value}))}/></label><label><span>الوحدة</span><input value={quickAddForm.piece_unit} onChange={(event)=>setQuickAddForm((form)=>({...form,piece_unit:event.target.value}))}/></label></>}
        <label><span>تاريخ الإسناد *</span><input required type="date" max={todayIsoInRiyadh()} value={quickAddForm.effective_from||date} onChange={(event)=>setQuickAddForm((form)=>({...form,effective_from:event.target.value}))}/><small>أول يوم فعلي للعامل مع هذا المقاول في المشروع. يصبح العامل متاحًا للتايم شيت من هذا التاريخ فما بعد.</small></label>
        <label><span>المقاول</span><input value={selectedContractor?.name_ar||''} readOnly/></label>
        <button type="submit" className={styles.primaryAction} disabled={busy==='quick-add'}>{busy==='quick-add'?'جارٍ الإضافة…':'إضافة وإسناد للمشروع'}</button>
      </form>
      {quickAddResults.some((row)=>row.status==='needs_transfer')&&<div style={{marginTop:14}}>
        <div className={styles.panelEmpty}>وجد البرنامج أسماء موجودة أصلًا لدى مقاول آخر، لذلك لم ينشئ نسخًا مكررة. اختر النقل الصريح لكل اسم بنفس تاريخ الإسناد المحدد أعلاه.</div>
        <div className={styles.activityList}>{quickAddResults.filter((row)=>row.status==='needs_transfer').map((row)=><div className={styles.activityRow} key={row.laborer_id}><div><strong>{row.name}</strong><small>موجود لدى مقاول آخر</small></div><button type="button" className="btn" disabled={busy===`quick-transfer:${row.laborer_id}`} onClick={()=>transferQuickCandidate(row)}>{busy===`quick-transfer:${row.laborer_id}`?'جارٍ النقل…':'نقل إلى هنا'}</button></div>)}</div>
      </div>}
    </ConstitutionDialog>}

    {editFor&&<ConstitutionDialog title={`تعديل: ${editFor.full_name}`} size="wide" onClose={()=>setEditFor(null)}>
      <form className={styles.operationForm} onSubmit={saveEdit}>
        <label><span>الاسم</span><input required value={editForm.full_name||''} onChange={(event)=>setEditForm((form)=>({...form,full_name:event.target.value}))}/></label>
        <label><span>الصفة</span><select value={editForm.labor_class||'worker'} onChange={(event)=>setEditForm((form)=>({...form,labor_class:event.target.value}))}>{Object.entries(PROJECT_LABOR_CLASS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>المهنة</span><input value={editForm.trade||''} onChange={(event)=>setEditForm((form)=>({...form,trade:event.target.value}))}/></label>
        <label><span>طريقة الأجر</span><select value={editForm.pay_basis||'daily'} onChange={(event)=>setEditForm((form)=>({...form,pay_basis:event.target.value}))}>{Object.entries(PROJECT_LABOR_PAY_BASIS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {editForm.pay_basis==='daily'&&<label><span>اليومية</span><input type="number" min="0" step="0.01" value={editForm.daily_rate||''} onChange={(event)=>setEditForm((form)=>({...form,daily_rate:event.target.value}))}/></label>}
        {editForm.pay_basis==='salary'&&<><label><span>الراتب الشهري</span><input type="number" min="0" step="0.01" value={editForm.monthly_salary||''} onChange={(event)=>setEditForm((form)=>({...form,monthly_salary:event.target.value}))}/></label><label><span>أيام الاحتساب</span><input type="number" min="1" value={editForm.salary_days||30} onChange={(event)=>setEditForm((form)=>({...form,salary_days:event.target.value}))}/></label></>}
        {editForm.pay_basis==='piecework'&&<><label><span>سعر الوحدة</span><input type="number" min="0" step="0.01" value={editForm.piece_rate||''} onChange={(event)=>setEditForm((form)=>({...form,piece_rate:event.target.value}))}/></label><label><span>الوحدة</span><input value={editForm.piece_unit||''} onChange={(event)=>setEditForm((form)=>({...form,piece_unit:event.target.value}))}/></label></>}
        <label><span>من تاريخ</span><input required type="date" value={editForm.valid_from||''} onChange={(event)=>setEditForm((form)=>({...form,valid_from:event.target.value}))}/></label>
        <label><span>إلى تاريخ</span><input type="date" value={editForm.valid_to||''} onChange={(event)=>setEditForm((form)=>({...form,valid_to:event.target.value}))}/></label>
        <label className={styles.wideField}><span>سبب التعديل *</span><input required value={editForm.reason||''} onChange={(event)=>setEditForm((form)=>({...form,reason:event.target.value}))}/></label>
        <button type="submit" className={styles.primaryAction} disabled={busy==='edit'}>{busy==='edit'?'جارٍ الحفظ…':'حفظ'}</button>
      </form>
    </ConstitutionDialog>}

    {moveFor&&<ConstitutionDialog title={`نقل: ${moveFor.full_name}`} size="compact" onClose={()=>setMoveFor(null)}>
      <form className={styles.operationForm} onSubmit={saveMove}>
        <label className={styles.wideField}><span>المقاول الجديد</span><select required value={moveForm.contractor_id} onChange={(event)=>changeMoveContractor(event.target.value)}><option value="">اختر المقاول</option>{contractors.filter((contractor)=>contractor.id!==moveFor.contractor_id).map((contractor)=><option key={contractor.id} value={contractor.id}>{contractor.name_ar}</option>)}</select></label>
        <label><span>من تاريخ</span><input required type="date" value={moveForm.effective_from} onChange={(event)=>setMoveForm((form)=>({...form,effective_from:event.target.value}))}/></label>
        {moveFor.pay_basis==='daily'&&<label><span>اليومية الجديدة</span><input type="number" min="0" step="0.01" value={moveForm.daily_rate} onChange={(event)=>setMoveForm((form)=>({...form,daily_rate:event.target.value}))}/></label>}
        <label className={styles.wideField}><span>ملاحظة</span><input value={moveForm.notes} onChange={(event)=>setMoveForm((form)=>({...form,notes:event.target.value}))}/></label>
        <button type="submit" className={styles.primaryAction} disabled={busy==='move'}>{busy==='move'?'جارٍ النقل…':'نقل'}</button>
      </form>
    </ConstitutionDialog>}
  </div>;
}
