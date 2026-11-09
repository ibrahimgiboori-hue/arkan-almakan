import { resolveRosterAssignment } from './site-operation-roster.mjs';

export const PROJECT_LABOR_CLASS = Object.freeze({ worker:'عامل', technician:'صنايعي', foreman:'فورمان' });
export const PROJECT_LABOR_PAY_BASIS = Object.freeze({ daily:'يومية', salary:'راتب شهري', piecework:'بالوحدة' });

export const EMPTY_PROJECT_LABOR_QUICK_ADD = Object.freeze({
  names:'', labor_class:'worker', trade:'', pay_basis:'daily', daily_rate:'',
  monthly_salary:'', salary_days:30, piece_rate:'', piece_unit:'م2', effective_from:'',
});

const naturalCompare=(a='',b='')=>String(a).localeCompare(String(b),'ar',{numeric:true,sensitivity:'base'});
const numberOrNull=(value)=>value===''||value==null?null:(Number.isFinite(Number(value))?Number(value):null);

export function projectLaborNamesFromInput(value){
  return [...new Set(String(value||'').split(/\r?\n|,|،/).map((name)=>name.trim()).filter(Boolean))];
}

export function projectLaborSuggestedDailyRate(contractor,laborClass='worker'){
  if(!contractor)return '';
  const rate=laborClass==='technician'?contractor.tech_daily:contractor.worker_daily;
  return rate==null?'':String(rate);
}

export function buildProjectLaborContractors(links=[],contractors=[]){
  return (contractors||[]).map((row)=>{
    const link=(links||[]).find((item)=>item.contractor_id===row.id);
    return {
      ...row,
      project_basis:link?.basis||null,
      worker_daily:link?.worker_daily??row.worker_daily,
      tech_daily:link?.tech_daily??row.tech_daily,
    };
  }).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));
}

export function buildProjectLaborRoster({projectId,date,laborers=[],assignments=[]}={}){
  return (laborers||[]).map((worker)=>{
    const resolved=resolveRosterAssignment((assignments||[]).filter((candidate)=>candidate.laborer_id===worker.id),date);
    const assignment=resolved.eligible?resolved.assignment:null;
    const inProject=assignment?.project_id===projectId;
    return {
      ...worker,
      current_assignment:assignment,
      assignment_id:inProject?assignment.id:null,
      assignment_from:inProject?assignment.valid_from:null,
      assignment_to:inProject?assignment.valid_to:null,
      labor_class:inProject?(assignment.labor_class||worker.labor_class):worker.labor_class,
      trade:inProject?(assignment.trade||worker.trade):worker.trade,
      pay_basis:inProject?(assignment.pay_basis||worker.pay_basis):worker.pay_basis,
      daily_rate:inProject?(assignment.daily_rate??worker.daily_rate):worker.daily_rate,
    };
  }).sort((a,b)=>naturalCompare(a.full_name,b.full_name));
}

export function buildQuickAddWorkersPayload({projectId,contractorId,effectiveFrom,form}){
  const names=projectLaborNamesFromInput(form?.names);
  if(!names.length)throw new Error('اكتب اسم عامل واحد على الأقل. يمكنك كتابة كل اسم في سطر مستقل.');
  if(!effectiveFrom)throw new Error('حدد تاريخ انضمام العامل للمقاول والمشروع.');
  return {
    p_project_id:projectId,
    p_contractor_id:contractorId,
    p_effective_from:effectiveFrom,
    p_names:names,
    p_labor_class:form?.labor_class||'worker',
    p_trade:String(form?.trade||'').trim()||null,
    p_pay_basis:form?.pay_basis||'daily',
    p_daily_rate:form?.pay_basis==='daily'?numberOrNull(form?.daily_rate):null,
    p_monthly_salary:form?.pay_basis==='salary'?numberOrNull(form?.monthly_salary):null,
    p_salary_days:Number(form?.salary_days||30),
    p_piece_rate:form?.pay_basis==='piecework'?numberOrNull(form?.piece_rate):null,
    p_piece_unit:form?.pay_basis==='piecework'?(String(form?.piece_unit||'م2').trim()||'م2'):null,
  };
}

export function summarizeQuickAddWorkers(results=[]){
  const created=(results||[]).filter((row)=>row.status==='created').length;
  const existing=(results||[]).filter((row)=>row.status==='existing').length;
  const transfers=(results||[]).filter((row)=>row.status==='needs_transfer').length;
  return Object.freeze({created,existing,transfers});
}

export function buildMoveLaborerPayload({worker,projectId,contractorId,effectiveFrom,dailyRate,notes}){
  if(!worker?.id)throw new Error('العامل غير محدد.');
  if(!projectId||!contractorId||!effectiveFrom)throw new Error('سياق نقل العامل غير مكتمل.');
  return {
    p_laborer_id:worker.id,
    p_project_id:projectId,
    p_contractor_id:contractorId,
    p_effective_from:effectiveFrom,
    p_labor_class:worker.labor_class,
    p_trade:worker.trade||null,
    p_pay_basis:worker.pay_basis||'daily',
    p_daily_rate:worker.pay_basis==='daily'?numberOrNull(dailyRate??worker.daily_rate):null,
    p_notes:String(notes||'').trim()||'نقل من إدارة عمالة المشروع',
  };
}

export function buildAssignLaborerPayload({worker,projectId,contractorId,effectiveFrom}){
  if(!worker?.id||!projectId||!contractorId||!effectiveFrom)throw new Error('سياق إسناد العامل غير مكتمل.');
  return {
    p_laborer_id:worker.id,
    p_project_id:projectId,
    p_contractor_id:contractorId,
    p_effective_from:effectiveFrom,
  };
}

export function buildUpdateLaborAssignmentPayload({assignmentId,form}){
  if(!assignmentId)throw new Error('إسناد العامل غير محدد.');
  if(!String(form?.reason||'').trim())throw new Error('اكتب سبب التعديل لحفظ الأثر التاريخي.');
  return {
    p_assignment_id:assignmentId,
    p_full_name:String(form?.full_name||'').trim(),
    p_labor_class:form?.labor_class||'worker',
    p_trade:String(form?.trade||'').trim()||null,
    p_pay_basis:form?.pay_basis||'daily',
    p_daily_rate:form?.pay_basis==='daily'?numberOrNull(form?.daily_rate):null,
    p_monthly_salary:form?.pay_basis==='salary'?numberOrNull(form?.monthly_salary):null,
    p_salary_days:Number(form?.salary_days||30),
    p_piece_rate:form?.pay_basis==='piecework'?numberOrNull(form?.piece_rate):null,
    p_piece_unit:String(form?.piece_unit||'').trim()||null,
    p_valid_from:form?.valid_from,
    p_valid_to:form?.valid_to||null,
    p_reason:String(form?.reason||'').trim(),
  };
}

/* ---------- the labor sheet ---------- */

const sheetDraftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createLaborDraft(seed={},idFactory=sheetDraftId){
  return {_id:idFactory(),id:null,persisted:false,full_name:'',labor_class:'worker',trade:'',pay_basis:'daily',rate:'',piece_unit:'م2',effective_from:'',...seed};
}

/** The pay figure that matches the pay basis (daily rate, monthly salary or unit rate). */
export function projectLaborRate(worker){
  if(worker?.pay_basis==='salary')return worker?.monthly_salary??'';
  if(worker?.pay_basis==='piecework')return worker?.piece_rate??'';
  return worker?.daily_rate??'';
}

/** A roster worker as a locked sheet row. */
export function laborRosterRow(worker,projectId){
  const inProject=worker?.current_assignment?.project_id===projectId;
  const elsewhere=Boolean(worker?.current_assignment&&!inProject);
  return {
    _id:`worker-${worker?.id}`,id:worker?.id||null,persisted:true,worker,
    full_name:worker?.full_name||'',labor_class:worker?.labor_class||'worker',trade:worker?.trade||'',
    pay_basis:worker?.pay_basis||'daily',rate:String(projectLaborRate(worker)??''),piece_unit:worker?.piece_unit||'',
    effective_from:worker?.assignment_from||'',
    placement:inProject?'project':elsewhere?'elsewhere':'free',
  };
}

export function laborDraftUsed(row){
  return !row?.persisted&&Boolean(String(row?.full_name||'').trim());
}

/**
 * New sheet rows → quick-add calls. Rows sharing class, trade, pay and date are added in one call
 * (the guarded RPC takes several names with one set of terms).
 */
export function groupLaborDraftsForQuickAdd(rows=[],fallbackDate=''){
  const errors=[];
  const groups=new Map();
  (rows||[]).forEach((row,index)=>{
    if(!laborDraftUsed(row))return;
    const at=`الصف ${index+1}`;
    const effectiveFrom=row.effective_from||fallbackDate;
    if(!PROJECT_LABOR_CLASS[row.labor_class]){errors.push(`${at}: اختر الصفة.`);return;}
    if(!PROJECT_LABOR_PAY_BASIS[row.pay_basis]){errors.push(`${at}: اختر طريقة الأجر.`);return;}
    if(!effectiveFrom){errors.push(`${at}: تاريخ الإسناد مطلوب.`);return;}
    const rate=row.rate===''||row.rate==null?'':String(row.rate);
    const unit=row.pay_basis==='piecework'?(String(row.piece_unit||'م2').trim()||'م2'):'';
    const key=[effectiveFrom,row.labor_class,String(row.trade||'').trim(),row.pay_basis,rate,unit].join('|');
    if(!groups.has(key))groups.set(key,{effectiveFrom,rows:[],form:{
      ...EMPTY_PROJECT_LABOR_QUICK_ADD,names:'',labor_class:row.labor_class,trade:String(row.trade||'').trim(),pay_basis:row.pay_basis,
      daily_rate:row.pay_basis==='daily'?rate:'',monthly_salary:row.pay_basis==='salary'?rate:'',
      piece_rate:row.pay_basis==='piecework'?rate:'',piece_unit:unit||EMPTY_PROJECT_LABOR_QUICK_ADD.piece_unit,effective_from:effectiveFrom,
    }});
    const group=groups.get(key);
    group.rows.push(row);
    group.form.names=group.rows.map((item)=>String(item.full_name).trim()).join('\n');
  });
  return Object.freeze({groups:[...groups.values()],errors});
}
