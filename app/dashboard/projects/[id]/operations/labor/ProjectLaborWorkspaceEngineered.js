'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';
import { todayIsoInRiyadh } from '@/lib/format';
import { moveOperationalDate } from '@/lib/project-operation-context.mjs';
import { useProjectOperationContext } from '@/lib/use-project-operation-context';
import { projectLaborService } from '@/lib/application/project-labor-service';
import {
  PROJECT_LABOR_CLASS,
  PROJECT_LABOR_PAY_BASIS,
  createLaborDraft,
  groupLaborDraftsForQuickAdd,
  laborRosterRow,
  projectLaborSuggestedDailyRate,
} from '@/lib/project-labor.mjs';
import RawGrid, { RawGridFooter, rawGridStyles } from '@/components/ui/RawGrid';
import styles from '../operations.module.css';

const options=(labels)=>Object.entries(labels).map(([value,label])=>({value,label}));
const PLACEMENT={project:'مسند للمشروع',elsewhere:'لدى مشروع آخر',free:'غير مسند'};
const RATE_LABEL={daily:'يومية',salary:'راتب شهري',piecework:'سعر الوحدة'};

function dateLabel(value){
  if(!value)return '—';
  const [y,m,d]=String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
}

/**
 * العمالة كورقة إكسل: عمالة المقاول المسجلة صفوف مقفلة (إسناد/نقل/تعديل من عمود الإجراء)،
 * والعمالة الجديدة تُكتب أو تُلصق أسماؤها من إكسل تحتها ثم تُضاف وتُسند مرة واحدة.
 */
export default function ProjectLaborWorkspaceEngineered({service=projectLaborService}={}){
  const {id:projectId}=useParams();
  const {date,contractorId,ready:contextReady,setDate,setContractorId}=useProjectOperationContext(projectId);

  const [contractors,setContractors]=useState([]);
  const [roster,setRoster]=useState([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');
  const [drafts,setDrafts]=useState([]);
  const [quickAddResults,setQuickAddResults]=useState([]);
  const [editFor,setEditFor]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [moveFor,setMoveFor]=useState(null);
  const [moveForm,setMoveForm]=useState({contractor_id:'',effective_from:'',daily_rate:'',notes:''});

  const load=useCallback(async()=>{
    if(!contextReady||!projectId||!date)return;
    setLoading(true);setLoadError('');setErr('');
    try{
      const workspace=await service.loadWorkspace({projectId,date});
      setContractors(workspace.contractors);
      setRoster(workspace.roster);
      const selectedStillExists=contractorId&&workspace.contractors.some((row)=>row.id===contractorId);
      if(!selectedStillExists)setContractorId(workspace.contractors[0]?.id||'');
    }catch(error){
      const message='تعذر تحميل عمالة المشروع: '+(error.message||error);
      setLoadError(message);setErr(message);setContractors([]);setRoster([]);
    }
    setLoading(false);
  },[contextReady,date,projectId,contractorId,setContractorId,service]);

  useEffect(()=>{load();},[load]);

  const selectedContractor=contractors.find((row)=>row.id===contractorId)||null;
  const contractorRoster=useMemo(()=>roster.filter((worker)=>worker.contractor_id===contractorId),[contractorId,roster]);
  const projectWorkers=useMemo(()=>contractorRoster.filter((worker)=>worker.current_assignment?.project_id===projectId),[contractorRoster,projectId]);

  function suggestedDailyRate(laborClass='worker'){
    return projectLaborSuggestedDailyRate(selectedContractor,laborClass);
  }

  // Stable keys only: reloading the roster after a save must not wipe rows that were not added.
  const contractorKey=selectedContractor?.id||'';
  const workerDaily=selectedContractor?.worker_daily??'';
  const blankDraft=useCallback(()=>createLaborDraft({rate:String(workerDaily||''),effective_from:date}),[workerDaily,date]);
  useEffect(()=>{setDrafts([1,2,3].map(()=>blankDraft()));setQuickAddResults([]);},[contractorKey,date]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows=useMemo(()=>[...contractorRoster.map((worker)=>laborRosterRow(worker,projectId)),...drafts],[contractorRoster,drafts,projectId]);
  const {groups,errors}=groupLaborDraftsForQuickAdd(drafts,date);
  const readyCount=groups.reduce((sum,group)=>sum+group.rows.length,0);

  function patchRow(key,patch){setDrafts((prev)=>prev.map((row)=>row._id===key?{...row,...patch}:row));}
  function appendRows(patches){setDrafts((prev)=>[...prev,...patches.map((patch)=>({...blankDraft(),...patch}))]);}
  function removeRow(row){setDrafts((prev)=>prev.length>1?prev.filter((item)=>item._id!==row._id):[blankDraft()]);}

  async function saveNewLabor(){
    if(!selectedContractor)return;
    if(errors.length){setErr(errors.slice(0,4).join(' '));return;}
    if(!groups.length)return;
    setBusy('quick-add');setErr('');setMsg('');setQuickAddResults([]);
    const results=[];
    const added=new Set();
    let failure='';
    for(const group of groups){
      try{
        const result=await service.quickAdd({
          projectId,contractorId:selectedContractor.id,effectiveFrom:group.effectiveFrom,form:group.form,today:todayIsoInRiyadh(),
        });
        results.push(...result.results.map((row)=>({...row,effectiveFrom:group.effectiveFrom})));
        group.rows.forEach((row)=>added.add(row._id));
      }catch(error){failure=`تعذر إضافة ${group.rows.map((row)=>row.full_name).join('، ')}: ${error.message||error}`;break;}
    }
    setQuickAddResults(results);
    const created=results.filter((row)=>row.status==='created').length;
    const existing=results.filter((row)=>row.status==='existing').length;
    const transfers=results.filter((row)=>row.status==='needs_transfer').length;
    const parts=[];
    if(created)parts.push(`أُضيف ${created}`);
    if(existing)parts.push(`أُسند ${existing} موجود`);
    if(transfers)parts.push(`${transfers} يحتاج نقلًا صريحًا`);
    if(parts.length)setMsg(`${parts.join('، ')}.`);
    if(failure)setErr(failure);
    setDrafts((prev)=>{
      const next=prev.filter((row)=>!added.has(row._id));
      return next.length?next:[blankDraft()];
    });
    if(results.length)await load();
    setBusy('');
  }

  async function transferQuickCandidate(candidate){
    if(!candidate?.laborer_id||!selectedContractor)return;
    const key=`quick-transfer:${candidate.laborer_id}`;
    setBusy(key);setErr('');setMsg('');
    try{
      const effectiveFrom=candidate.effectiveFrom||date;
      const worker=await service.transferQuickCandidate({candidate,selectedContractor,projectId,effectiveFrom});
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
      const result=await service.assignWorker({worker,projectId,contractorId:selectedContractor.id,effectiveFrom:date});
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
      await service.updateWorker({worker:editFor,form:editForm});
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
      await service.moveWorker({
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

      {!selectedContractor?<div className={styles.empty}>لا يوجد مقاول مسند للمشروع في التاريخ المختار.</div>:<section data-canonical-labor-create-form="true">
        <div className={styles.panelTitle}>
          <div><h2>عمالة المقاول</h2><small>العمالة المسجلة مقفلة أعلى الورقة. الإضافة الجديدة من هنا فقط: اكتب أو الصق الأسماء من إكسل (الاسم، الصفة، المهنة، الأجر) فتُضاف وتُسند للمشروع والمقاول بتاريخ الإسناد معًا.</small></div>
        </div>
        <RawGrid
          columns={[
            {key:'_index',label:'#',type:'index',render:(row)=>rows.indexOf(row)+1},
            {key:'_status',label:'الحالة',type:'badge',text:(row)=>row.persisted?PLACEMENT[row.placement]:'جديد',tone:(row)=>!row.persisted?'new':row.placement==='project'?'saved':'muted'},
            {key:'full_name',label:'الاسم',type:'text',minWidth:200,placeholder:'اسم العامل'},
            {key:'labor_class',label:'الصفة',type:'select',minWidth:110,options:options(PROJECT_LABOR_CLASS),
              onChange:(row,value)=>({labor_class:value,...(row.pay_basis==='daily'&&String(row.rate||'')===String(suggestedDailyRate(row.labor_class)||'')?{rate:String(suggestedDailyRate(value)||'')}:{})})},
            {key:'trade',label:'المهنة',type:'text',minWidth:120},
            {key:'pay_basis',label:'طريقة الأجر',type:'select',minWidth:120,options:options(PROJECT_LABOR_PAY_BASIS),
              onChange:(row,value)=>({pay_basis:value,rate:value==='daily'?String(suggestedDailyRate(row.labor_class)||''):''})},
            {key:'rate',label:'الأجر',type:'number',min:0,step:0.01},
            {key:'_rate_kind',label:'نوع الأجر',type:'computed',compute:(row)=>row.rate===''?null:`${RATE_LABEL[row.pay_basis]||''}${row.pay_basis==='piecework'&&row.piece_unit?` / ${row.piece_unit}`:''}`},
            {key:'piece_unit',label:'الوحدة',type:'text',visible:(row)=>row.pay_basis==='piecework'},
            {key:'effective_from',label:'تاريخ الإسناد',type:'date'},
            {key:'_action',label:'إجراء',type:'action',render:(row,{disabled})=>{
              if(!row.persisted)return <button type="button" className={rawGridStyles.actionButton} onClick={()=>removeRow(row)} disabled={disabled||busy==='quick-add'}>×</button>;
              const worker=row.worker;
              if(row.placement==='project')return <span style={{display:'inline-flex',gap:6}}><button type="button" className={rawGridStyles.actionButton} onClick={()=>openEdit(worker)}>تعديل</button><button type="button" className={rawGridStyles.actionButton} onClick={()=>openMove(worker)}>نقل</button></span>;
              const actionKey=`${row.placement==='elsewhere'?'move-in':'assign'}:${worker.id}`;
              return <button type="button" className={rawGridStyles.actionButton} disabled={busy===actionKey} onClick={()=>assignWorker(worker)}>{busy===actionKey?'جارٍ التنفيذ…':row.placement==='elsewhere'?'نقل للمشروع':'إسناد'}</button>;
            }},
          ]}
          rows={rows}
          rowKey={(row)=>row._id}
          savedFlag={(row)=>row.persisted}
          rowDisabled={(row)=>row.persisted}
          onPatchRow={patchRow}
          onAppendRows={appendRows}
          busy={busy==='quick-add'}
        />
        <RawGridFooter
          actions={<button type="button" className={rawGridStyles.plainButton} onClick={()=>setDrafts((prev)=>[...prev,...[1,2,3].map(()=>blankDraft())])} disabled={Boolean(busy)}>+ 3 صفوف</button>}
          summary={<>
            <strong>جاهز للإضافة: {readyCount} اسم{errors.length?` · ${errors.length} ناقص`:''}</strong>
            <button className={rawGridStyles.primaryButton} type="button" onClick={saveNewLabor} disabled={busy==='quick-add'||(!readyCount&&!errors.length)}>{busy==='quick-add'?'جارٍ الإضافة…':'إضافة وإسناد للمشروع'}</button>
          </>}
        />
        {quickAddResults.some((row)=>row.status==='needs_transfer')&&<div style={{marginTop:14}}>
          <div className={styles.panelEmpty}>وجد البرنامج أسماء موجودة أصلًا لدى مقاول آخر، لذلك لم ينشئ نسخًا مكررة. اختر النقل الصريح لكل اسم بنفس تاريخ الإسناد.</div>
          <div className={styles.activityList}>{quickAddResults.filter((row)=>row.status==='needs_transfer').map((row)=><div className={styles.activityRow} key={row.laborer_id}><div><strong>{row.name}</strong><small>موجود لدى مقاول آخر · إسناد من {row.effectiveFrom}</small></div><button type="button" className="btn" disabled={busy===`quick-transfer:${row.laborer_id}`} onClick={()=>transferQuickCandidate(row)}>{busy===`quick-transfer:${row.laborer_id}`?'جارٍ النقل…':'نقل إلى هنا'}</button></div>)}</div>
        </div>}
      </section>}
    </>}

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
