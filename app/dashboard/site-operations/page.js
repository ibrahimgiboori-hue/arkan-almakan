'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseSiteCommand, SITE_COMMAND_EXAMPLES } from '@/lib/site-operation-command';
import styles from './page.module.css';

const STATUS={
  full:{ar:'كامل',short:'ك'},
  half:{ar:'نصف',short:'½'},
  absent:{ar:'غياب',short:'غ'},
  stopped:{ar:'توقف',short:'ت'},
  leave:{ar:'إجازة',short:'إ'},
};
const CATEGORIES=['وجبات','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','تأمين مسترد','عهدة','تأمين طبي','ضيافة','أخرى'];
const CHARGE_AR={arkan:'أركان',contractor:'المقاول',owner:'المالك'};
const PAYER_AR={contractor:'المقاول',arkan_custody:'أركان من العهدة',arkan_direct:'أركان مباشرة'};
const SOURCE_AR={bank:'تحويل بنكي',cash:'نقداً',custody:'من عهدة'};
const iso=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const money=(n)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
const naturalCompare=(a='',b='')=>String(a).localeCompare(String(b),'ar',{numeric:true,sensitivity:'base'});

function suggestedCategory(text=''){
  if(/بنزين|ديزل|وقود/i.test(text))return 'وقود';
  if(/وجبة|وجبات|فطار|إفطار|غداء|غدا|عشاء/i.test(text))return 'وجبات';
  if(/تذكرة|تذاكر|ترحيل|مواصل/i.test(text))return 'ترحيل';
  if(/تأمين طبي|تامين طبي/i.test(text))return 'تأمين طبي';
  if(/عهدة/i.test(text))return 'عهدة';
  if(/تأمين|تامين|ضمان|مسترد/i.test(text))return 'تأمين مسترد';
  if(/خشب|منشار|كلبسات|مسامير|عدة|أداة|اداة|معدات/i.test(text))return 'عدد وأدوات';
  if(/سكن|إيجار سكن|ايجار سكن/i.test(text))return 'سكن';
  if(/سقال/i.test(text))return 'سقالات';
  if(/مواد|أسمنت|اسمنت|رمل|بحص/i.test(text))return 'مواد';
  return 'أخرى';
}
function isRecoverable(text='',cat=''){
  if(cat==='تأمين طبي')return false;
  return ['عهدة','تأمين مسترد'].includes(cat)||/مسترد|ضمان/i.test(text);
}
function chargeFor(c,cat){
  if(cat==='وجبات')return c?.meals_charge_to||'contractor';
  if(cat==='ترحيل'||cat==='وقود')return c?.transport_charge_to||'contractor';
  if(cat==='سكن')return c?.housing_charge_to||'contractor';
  if(cat==='عدد وأدوات'||cat==='سقالات')return c?.tools_charge_to||'contractor';
  return 'arkan';
}

export default function SiteOperationsPage(){
  const [projects,setProjects]=useState([]);
  const [allContractors,setAllContractors]=useState([]);
  const [projectId,setProjectId]=useState('');
  const [date,setDate]=useState(iso(new Date()));
  const [dayId,setDayId]=useState(null);
  const [projectLinks,setProjectLinks]=useState([]);
  const [contractors,setContractors]=useState([]);
  const [workers,setWorkers]=useState([]);
  const [marks,setMarks]=useState({});
  const [items,setItems]=useState([]);
  const [itemLinks,setItemLinks]=useState([]);
  const [outputs,setOutputs]=useState([]);
  const [expenses,setExpenses]=useState([]);
  const [advances,setAdvances]=useState([]);
  const [payments,setPayments]=useState([]);
  const [accounts,setAccounts]=useState([]);
  const [reviewCount,setReviewCount]=useState(0);
  const [activeContractor,setActiveContractor]=useState('');
  const [workerSearch,setWorkerSearch]=useState('');
  const [command,setCommand]=useState('');
  const [preview,setPreview]=useState(null);
  const [panel,setPanel]=useState(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState('');
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  useEffect(()=>{
    (async()=>{
      const [p,c]=await Promise.all([
        supabase.from('projects').select('id,project_no,name_ar').eq('status','active').order('project_no'),
        supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias,worker_daily,tech_daily,default_basis,meals_charge_to,transport_charge_to,housing_charge_to,tools_charge_to').eq('is_active',true).order('name_ar'),
      ]);
      setProjects(p.data||[]); setAllContractors(c.data||[]);
      const saved=typeof window!=='undefined'?localStorage.getItem('arkan.site.project'):'';
      if(saved&&(p.data||[]).some(x=>x.id===saved))setProjectId(saved);
    })();
  },[]);

  useEffect(()=>{
    if(typeof window!=='undefined'&&projectId)localStorage.setItem('arkan.site.project',projectId);
    setDayId(null); setActiveContractor(''); setPreview(null); setPanel(null);
  },[projectId,date]);

  const ensureDay=useCallback(async()=>{
    if(dayId)return dayId;
    const {data,error}=await supabase.rpc('fn_get_or_create_day',{p_project_id:projectId,p_date:date});
    if(error)throw error; setDayId(data); return data;
  },[dayId,projectId,date]);

  const load=useCallback(async()=>{
    if(!projectId||!date)return;
    setLoading(true);setErr('');setMsg('');
    try{
      const [dayQ,itemsQ,assignQ,pcQ,itemAssignQ,reviewQ,acctQ]=await Promise.all([
        supabase.from('timesheet_days').select('id').eq('project_id',projectId).eq('work_date',date).maybeSingle(),
        supabase.from('project_items').select('id,description_ar,unit,sort_order').eq('project_id',projectId).eq('kind','item').order('sort_order'),
        supabase.from('labor_project_assignments').select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to').eq('project_id',projectId).lte('valid_from',date).or(`valid_to.is.null,valid_to.gte.${date}`),
        supabase.from('project_contractors').select('id,contractor_id,basis,worker_daily,tech_daily,piece_rate,piece_unit,meals_charge_to,transport_charge_to,housing_charge_to,tools_charge_to,start_date,end_date,is_active').eq('project_id',projectId).eq('is_active',true).lte('start_date',date).or(`end_date.is.null,end_date.gte.${date}`),
        supabase.from('v_item_assignments').select('project_item_id,item_name,unit,contractor_id,contractor_name,is_active,start_date,end_date').eq('project_id',projectId),
        supabase.from('v_contractor_expense_review').select('id').eq('project_id',projectId).not('review_reason','is',null),
        supabase.from('v_contractor_project_account').select('*').eq('project_id',projectId),
      ]);
      if(dayQ.error)throw dayQ.error;
      const did=dayQ.data?.id||null; setDayId(did);
      const its=itemsQ.data||[], assigns=assignQ.data||[], pcs=pcQ.data||[], ial=itemAssignQ.data||[];
      setItems(its);setProjectLinks(pcs);setItemLinks(ial);setReviewCount((reviewQ.data||[]).length);setAccounts(acctQ.data||[]);

      const contractorIds=[...new Set([...pcs.map(x=>x.contractor_id),...assigns.map(x=>x.contractor_id)].filter(Boolean))];
      let cs=allContractors.filter(c=>contractorIds.includes(c.id));
      const missing=contractorIds.filter(id=>!cs.some(c=>c.id===id));
      if(missing.length){
        const q=await supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias,worker_daily,tech_daily,default_basis,meals_charge_to,transport_charge_to,housing_charge_to,tools_charge_to').in('id',missing);
        cs=[...cs,...(q.data||[])];
      }
      cs=cs.map(c=>{
        const pc=pcs.find(x=>x.contractor_id===c.id);
        return {...c,
          meals_charge_to:pc?.meals_charge_to||c.meals_charge_to,
          transport_charge_to:pc?.transport_charge_to||c.transport_charge_to,
          housing_charge_to:pc?.housing_charge_to||c.housing_charge_to,
          tools_charge_to:pc?.tools_charge_to||c.tools_charge_to,
          worker_daily:pc?.worker_daily??c.worker_daily,
          tech_daily:pc?.tech_daily??c.tech_daily,
          project_basis:pc?.basis||null,
        };
      });
      setContractors(cs.sort((a,b)=>naturalCompare(a.name_ar,b.name_ar)));

      const laborerIds=[...new Set(assigns.map(x=>x.laborer_id).filter(Boolean))];
      let labs=[];
      if(laborerIds.length){
        const q=await supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,monthly_salary,salary_days,pay_basis,contractor_id,is_active').in('id',laborerIds).eq('is_active',true).order('full_name');
        const byId=Object.fromEntries(assigns.map(a=>[a.laborer_id,a]));
        labs=(q.data||[]).map(w=>{
          const a=byId[w.id];
          return {...w,contractor_id:a?.contractor_id||w.contractor_id,labor_class:a?.labor_class||w.labor_class,trade:a?.trade||w.trade,daily_rate:a?.daily_rate??w.daily_rate,pay_basis:a?.pay_basis||w.pay_basis,assignment_id:a?.id};
        });
      }
      setWorkers(labs.sort((a,b)=>naturalCompare(a.full_name,b.full_name)));

      let att=[],out=[];
      if(did){
        const [a,o]=await Promise.all([
          supabase.from('attendance').select('id,laborer_id,status,contractor_id_snapshot,amount,rate_used').eq('day_id',did),
          supabase.from('day_items').select('id,project_item_id,contractor_id,group_output,unit,notes').eq('day_id',did),
        ]);
        att=a.data||[];out=o.data||[];
      }
      const [e,a,p]=await Promise.all([
        supabase.from('contractor_expenses').select('id,contractor_id,category,amount,notes,is_recoverable,payer,charge_to,project_item_id').eq('project_id',projectId).eq('expense_date',date).order('created_at'),
        supabase.from('contractor_advances').select('id,contractor_id,amount,remaining,notes').eq('project_id',projectId).eq('advance_date',date).order('created_at'),
        supabase.from('contractor_payments').select('id,contractor_id,amount,kind,source,reference,notes').eq('project_id',projectId).eq('payment_date',date).order('created_at'),
      ]);
      const ex=e.data||[];
      setMarks(Object.fromEntries(att.map(x=>[x.laborer_id,x])));setOutputs(out);setExpenses(ex);setAdvances(a.data||[]);setPayments(p.data||[]);
    }catch(e){setErr('تعذّر فتح دفتر التشغيل: '+(e.message||e));}
    setLoading(false);
  },[projectId,date,allContractors]);

  useEffect(()=>{load();},[load]);

  const groups=useMemo(()=>contractors.map(c=>({
    ...c,
    workers:workers.filter(w=>w.contractor_id===c.id).sort((a,b)=>naturalCompare(a.full_name,b.full_name)),
    outputs:outputs.filter(x=>x.contractor_id===c.id),
    expenses:expenses.filter(x=>x.contractor_id===c.id),
    advances:advances.filter(x=>x.contractor_id===c.id),
    payments:payments.filter(x=>x.contractor_id===c.id),
    account:accounts.find(x=>x.contractor_id===c.id)||null,
  })),[contractors,workers,outputs,expenses,advances,payments,accounts]);

  const shownGroups=useMemo(()=>{
    if(!activeContractor)return groups;
    return groups.filter(g=>g.id===activeContractor);
  },[groups,activeContractor]);

  const totals=useMemo(()=>{
    const done=workers.filter(w=>marks[w.id]).length;
    return {
      workers:workers.length,
      pending:Math.max(0,workers.length-done),
      done,
      output:outputs.length,
      expenses:expenses.reduce((s,x)=>s+Number(x.amount||0),0),
    };
  },[workers,marks,outputs,expenses]);

  async function saveAttendanceRows(rows){
    if(!rows.length)return [];
    const id=await ensureDay();
    const payload=rows.map(({worker,status})=>({day_id:id,laborer_id:worker.id,status,rate_used:Number(worker.daily_rate||0)}));
    const {data,error}=await supabase.from('attendance').upsert(payload,{onConflict:'day_id,laborer_id'}).select('id,laborer_id,status,contractor_id_snapshot,amount,rate_used');
    if(error)throw error;
    setMarks(m=>({...m,...Object.fromEntries((data||[]).map(a=>[a.laborer_id,a]))}));
    return data||[];
  }
  async function markWorker(w,status){
    setBusy('att-'+w.id);setErr('');
    try{await saveAttendanceRows([{worker:w,status}]);}
    catch(e){setErr(e.message||String(e));}
    setBusy('');
  }
  async function markAll(g,status='full',pendingOnly=true){
    const list=g.workers.filter(w=>!pendingOnly||!marks[w.id]);
    if(!list.length)return;
    setBusy('group-'+g.id);setErr('');
    try{await saveAttendanceRows(list.map(worker=>({worker,status})));setMsg(`تم تسجيل ${list.length} فرداً`);}
    catch(e){setErr(e.message||String(e));}
    setBusy('');
  }
  async function closeAttendance(g){
    const pending=g.workers.filter(w=>!marks[w.id]);
    if(!pending.length)return;
    if(!confirm(`سيُسجل ${pending.length} فرداً كغياب. متابعة؟`))return;
    await markAll(g,'absent',true);
  }
  async function clearContractorAttendance(g){
    const registered=g.workers.filter(w=>marks[w.id]);
    if(!registered.length)return;
    if(!confirm(`إلغاء تسجيلات الحضور لـ ${registered.length} فرداً لدى ${g.name_ar} في ${date}؟\nسيعودون إلى «غير مسجل».`))return;
    setBusy('clear-'+g.id);setErr('');setMsg('');
    try{
      const {data,error}=await supabase.rpc('fn_clear_contractor_attendance_day',{p_project_id:projectId,p_contractor_id:g.id,p_work_date:date});
      if(error)throw error;
      setMsg(`أُلغي ${Number(data||0)} تسجيل حضور/غياب، وعاد الأفراد إلى غير مسجل.`);
      await load();
    }catch(e){setErr('تعذّر التراجع: '+(e.message||e));}
    setBusy('');
  }
  async function removeAttendance(w){
    const row=marks[w.id];
    if(!row)return;
    if(!confirm(`إلغاء تسجيل ${w.full_name} لهذا اليوم؟`))return;
    setBusy('undo-'+w.id);setErr('');
    try{
      const {error}=await supabase.rpc('fn_remove_attendance_entry',{p_attendance_id:row.id});
      if(error)throw error;
      setMarks(m=>{const next={...m};delete next[w.id];return next;});
      setMsg(`أُلغي تسجيل ${w.full_name}`);
    }catch(e){setErr('تعذّر إلغاء التسجيل: '+(e.message||e));}
    setBusy('');
  }

  function parseCommand(){
    if(!projectId){setPreview({kind:'unknown',message:'اختر المشروع أولاً'});return;}
    const p=parseSiteCommand(command,{contractors,workers,items,date});
    setPreview(p);
  }
  async function confirmCommand(){
    if(!preview||['unknown','need','empty'].includes(preview.kind))return;
    setBusy('command');setErr('');setMsg('');
    try{
      if(preview.kind==='attendance')await saveAttendanceRows([{worker:preview.worker,status:preview.status}]);
      if(preview.kind==='bulk_attendance'){
        const g=groups.find(x=>x.id===preview.contractor.id);
        if(!g)throw new Error('المقاول غير موجود في المشروع');
        const pending=g.workers.filter(w=>!marks[w.id]);
        if(pending.length)await saveAttendanceRows(pending.map(worker=>({worker,status:'full'})));
        else setMsg('لا يوجد عمال غير مسجلين لهذا المقاول');
      }
      if(preview.kind==='output')await saveOutput(preview.contractor.id,preview.item.id,preview.qty,preview.notes||'إدخال سريع');
      if(preview.kind==='expense')await saveExpenseRecord(preview);
      if(preview.kind==='advance'){
        const {error}=await supabase.from('contractor_advances').insert({project_id:projectId,contractor_id:preview.contractor.id,advance_date:date,amount:Number(preview.amount),notes:preview.notes||'إدخال سريع'});
        if(error)throw error;
      }
      if(preview.kind==='payment'){
        const {error}=await supabase.from('contractor_payments').insert({project_id:projectId,contractor_id:preview.contractor.id,payment_date:date,amount:Number(preview.amount),kind:'on_account',source:preview.source||'bank',notes:preview.notes||'إدخال سريع'});
        if(error)throw error;
      }
      if(preview.kind==='transfer'){
        const {error}=await supabase.rpc('fn_move_laborer',{p_laborer_id:preview.worker.id,p_project_id:projectId,p_contractor_id:preview.contractor.id,p_effective_from:date,p_labor_class:preview.worker.labor_class,p_trade:preview.worker.trade||null,p_pay_basis:preview.worker.pay_basis||'daily',p_daily_rate:preview.worker.daily_rate||null,p_notes:'نقل من مركز التشغيل اليومي'});
        if(error)throw error;
      }
      setCommand('');setPreview(null);setMsg(m=>m||'تم حفظ الحركة');await load();
    }catch(e){setErr('تعذر حفظ الحركة: '+(e.message||e));}
    setBusy('');
  }

  async function saveOutput(contractorId,itemId,qty,notes){
    const id=await ensureDay();
    const item=items.find(x=>x.id===itemId);
    const old=outputs.find(x=>x.contractor_id===contractorId&&x.project_item_id===itemId);
    if(old){
      const {error}=await supabase.from('day_items').update({group_output:Number(old.group_output||0)+Number(qty),notes:notes||old.notes}).eq('id',old.id);
      if(error)throw error;
    }else{
      const {error}=await supabase.from('day_items').insert({day_id:id,project_item_id:itemId,contractor_id:contractorId,group_output:Number(qty),unit:item?.unit||null,notes:notes||null});
      if(error)throw error;
    }
  }
  async function saveExpenseRecord(x){
    const payload={project_id:projectId,contractor_id:x.contractor?.id||x.contractor_id,expense_date:date,amount:Number(x.amount),category:x.category||'أخرى',payer:x.payer||'contractor',charge_to:x.charge_to||'arkan',is_recoverable:!!x.is_recoverable,project_item_id:x.is_recoverable?null:(x.project_item_id||null),notes:x.notes||null};
    const {error}=await supabase.from('contractor_expenses').insert(payload);if(error)throw error;
  }

  async function attachContractor(id){
    setBusy('attach');setErr('');
    try{
      const {error}=await supabase.rpc('fn_attach_contractor_to_project',{p_project_id:projectId,p_contractor_id:id,p_start_date:date});
      if(error)throw error;setPanel(null);setMsg('أُضيف المقاول للمشروع');await load();
    }catch(e){setErr(e.message||String(e));}
    setBusy('');
  }
  async function setAlias(g){
    const alias=prompt('اختصار سريع للمقاول في شريط الأوامر',g.operation_alias||'');
    if(alias===null)return;
    const {error}=await supabase.from('contractors').update({operation_alias:alias.trim()||null}).eq('id',g.id);
    if(error)setErr(error.message);else{setMsg('حُفظ الاختصار');setAllContractors(x=>x.map(c=>c.id===g.id?{...c,operation_alias:alias.trim()||null}:c));}
  }

  async function addWorkers(e){
    e.preventDefault();
    const f=panel?.form||{};
    const names=String(f.names||'').split(/\n|،/).map(x=>x.trim()).filter(Boolean);
    if(!names.length){setErr('اكتب أسماء العمال، كل اسم في سطر');return;}
    setBusy('workers');setErr('');
    try{
      const {data,error}=await supabase.rpc('fn_quick_add_workers',{
        p_project_id:projectId,p_contractor_id:panel.contractorId,p_effective_from:f.effective_from||date,p_names:names,
        p_labor_class:f.labor_class||'worker',p_trade:f.trade||null,p_pay_basis:f.pay_basis||'daily',
        p_daily_rate:f.pay_basis==='daily'?(Number(f.rate)||null):null,
        p_monthly_salary:f.pay_basis==='salary'?(Number(f.salary)||null):null,
        p_salary_days:Number(f.salary_days||30),
        p_piece_rate:f.pay_basis==='piecework'?(Number(f.piece_rate)||null):null,p_piece_unit:f.piece_unit||'م2',
      });
      if(error)throw error;
      const arr=Array.isArray(data)?data:[];
      const created=arr.filter(x=>x.status==='created').length,existing=arr.filter(x=>x.status==='existing').length,conflict=arr.filter(x=>x.status==='needs_transfer').map(x=>x.name);
      setMsg(`أضيف ${created} · موجود مسبقاً ${existing}${conflict.length?` · يحتاج نقل: ${conflict.join('، ')}`:''}`);
      setPanel(null);await load();
    }catch(ex){setErr('تعذر إضافة العمال: '+(ex.message||ex));}
    setBusy('');
  }
  async function moveWorker(e){
    e.preventDefault();const f=panel?.form||{},w=panel?.worker;
    setBusy('move');setErr('');
    try{
      const {error}=await supabase.rpc('fn_move_laborer',{p_laborer_id:w.id,p_project_id:projectId,p_contractor_id:f.contractor_id,p_effective_from:f.effective_from||date,p_labor_class:w.labor_class,p_trade:w.trade||null,p_pay_basis:w.pay_basis||'daily',p_daily_rate:w.daily_rate||null,p_notes:f.notes||'نقل من مركز التشغيل'});
      if(error)throw error;setPanel(null);setMsg('تم نقل العامل مع حفظ تاريخه السابق');await load();
    }catch(ex){setErr(ex.message||String(ex));}
    setBusy('');
  }
  async function saveOutputPanel(e){
    e.preventDefault();const f=panel?.form||{};
    setBusy('output');setErr('');
    try{await saveOutput(panel.contractorId,f.item_id,Number(f.qty),f.notes||'إدخال من مركز التشغيل');setPanel(null);setMsg('حُفظ الإنجاز');await load();}
    catch(ex){setErr(ex.message||String(ex));}
    setBusy('');
  }
  async function saveMovement(e){
    e.preventDefault();const f=panel?.form||{},cid=panel.contractorId;
    setBusy('movement');setErr('');
    try{
      if(f.kind==='advance'){
        const {error}=await supabase.from('contractor_advances').insert({project_id:projectId,contractor_id:cid,advance_date:date,amount:Number(f.amount),notes:f.notes||null});if(error)throw error;
      }else if(f.kind==='payment'){
        const {error}=await supabase.from('contractor_payments').insert({project_id:projectId,contractor_id:cid,payment_date:date,amount:Number(f.amount),kind:'on_account',source:f.source||'bank',reference:f.reference||null,notes:f.notes||null});if(error)throw error;
      }else{
        const c=contractors.find(x=>x.id===cid),cat=f.category||suggestedCategory(f.notes||'');
        await saveExpenseRecord({contractor_id:cid,amount:f.amount,category:cat,payer:f.payer||'contractor',charge_to:f.charge_to||chargeFor(c,cat),is_recoverable:!!f.is_recoverable,project_item_id:f.project_item_id||null,notes:f.notes||null});
      }
      setPanel(null);setMsg('حُفظت الحركة المالية');await load();
    }catch(ex){setErr(ex.message||String(ex));}
    setBusy('');
  }

  function openWorkers(g){setPanel({type:'workers',contractorId:g.id,form:{names:'',labor_class:'worker',trade:'',pay_basis:'daily',rate:g.worker_daily||'',salary:'',salary_days:30,piece_rate:'',piece_unit:'م2',effective_from:date}});}
  function openOutput(g){
    const linked=itemLinks.filter(x=>x.contractor_id===g.id&&x.start_date<=date&&(!x.end_date||x.end_date>=date)).map(x=>x.project_item_id);
    const pool=linked.length?items.filter(x=>linked.includes(x.id)):items;
    setPanel({type:'output',contractorId:g.id,pool,form:{item_id:pool[0]?.id||'',qty:'',notes:''}});
  }
  function openMovement(g){
    setPanel({type:'movement',contractorId:g.id,form:{kind:'expense',amount:'',notes:'',category:'أخرى',payer:'contractor',charge_to:'arkan',is_recoverable:false,project_item_id:'',source:'bank',reference:''}});
  }
  function movementDescription(v){
    const c=contractors.find(x=>x.id===panel.contractorId),cat=suggestedCategory(v),rec=isRecoverable(v,cat);
    setPanel(p=>({...p,form:{...p.form,notes:v,category:cat,is_recoverable:rec,charge_to:chargeFor(c,cat),project_item_id:rec?'':p.form.project_item_id}}));
  }

  const unattached=allContractors.filter(c=>!projectLinks.some(p=>p.contractor_id===c.id));
  const selectedProject=projects.find(x=>x.id===projectId);

  return <div dir="rtl" className={styles.root}>
    <div className="page-head"><div><h1>مركز التشغيل اليومي</h1><p>هذه هي واجهة التنفيذ المعتمدة: اختر المشروع واليوم ثم سجّل كل ما حدث من نفس الصفحة.</p></div></div>

    <div className={styles.contextBar}>
      <div className="field"><label>المشروع</label><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">— اختر المشروع —</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>)}</select></div>
      <div className="field"><label>التاريخ</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <button className="btn ghost" disabled={!projectId||loading} onClick={load}>{loading?'جارٍ الفتح…':'تحديث اليوم'}</button>
      {projectId&&<button className="btn ghost" onClick={()=>setPanel({type:'attach'})}>إضافة مقاول للمشروع</button>}
    </div>

    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    {!projectId?<div className="empty"><h3>اختر المشروع مرة واحدة</h3><p>سيتذكره مركز التشغيل في زيارتك التالية.</p></div>:<>
      <section className={styles.commandBox}>
        <div className={styles.commandTitle}><div><b>الإدخال السريع</b><span>اكتب الحركة كما تقولها للمشرف — والحفظ لا يتم قبل المعاينة.</span></div><span>{selectedProject?.name_ar}</span></div>
        <div className={styles.commandRow}>
          <input value={command} onChange={e=>{setCommand(e.target.value);setPreview(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();parseCommand();}}} placeholder="مثال: الجساس بنزين 250" />
          <button className="btn" onClick={parseCommand} disabled={!command.trim()}>افهم الحركة</button>
        </div>
        <div className={styles.examples}>{SITE_COMMAND_EXAMPLES.map(x=><button type="button" key={x} onClick={()=>{setCommand(x);setPreview(null);}}>{x}</button>)}</div>
        {preview&&<CommandPreview value={preview} setValue={setPreview} onConfirm={confirmCommand} busy={busy==='command'} />}
      </section>

      <div className={styles.summary}>
        <Stat label="العمالة اليوم" value={totals.workers}/>
        <Stat label="غير المسجل" value={totals.pending} alert={totals.pending>0}/>
        <Stat label="حركات الإنجاز" value={totals.output}/>
        <Stat label="مصروف اليوم" value={money(totals.expenses)} suffix="ر.س"/>
      </div>

      {reviewCount>0&&<div className="msg err" style={{marginBottom:12}}>{reviewCount} مصروف تاريخي يحتاج مراجعة تصنيف. لم يُعدّل النظام أي حركة قديمة تلقائياً.</div>}

      <div className={styles.contractorTabs}>
        <button className={!activeContractor?styles.on:''} onClick={()=>setActiveContractor('')}>كل المقاولين</button>
        {groups.map(g=><button key={g.id} className={activeContractor===g.id?styles.on:''} onClick={()=>setActiveContractor(g.id)}>{g.operation_alias||g.name_ar}<small>{g.workers.filter(w=>!marks[w.id]).length} غير مسجل</small></button>)}
      </div>

      {groups.length===0&&<div className="empty"><h3>لا يوجد مقاول مرتبط بالمشروع</h3><p>اضغط «إضافة مقاول للمشروع»، وبعدها أضف العمال دفعة واحدة.</p></div>}

      {shownGroups.map(g=>{
        const q=workerSearch.trim().toLowerCase();
        const visible=g.workers.filter(w=>!q||[w.full_name,w.trade].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))).sort((a,b)=>naturalCompare(a.full_name,b.full_name));
        const pending=visible.filter(w=>!marks[w.id]),done=visible.filter(w=>marks[w.id]);
        const registeredAll=g.workers.filter(w=>marks[w.id]).length;
        const balance=Number(g.account?.balance_due||0);
        return <section className={styles.contractorCard} key={g.id}>
          <header>
            <div><h2>{g.name_ar}</h2><div className={styles.subline}>{g.operation_alias&&<span>اختصار: {g.operation_alias}</span>}<button type="button" onClick={()=>setAlias(g)}>تعديل الاختصار</button><span>{g.project_basis==='piecework'?'بالمتر / مقطوعية':g.project_basis==='salary'?'بالراتب':'باليومية'}</span></div></div>
            <div className={styles.accountMini}><span>{balance>=0?'مستحق له':'مستحق عليه'}</span><b>{money(Math.abs(balance))} ر.س</b></div>
          </header>

          <div className={styles.actions}>
            <button className="btn" onClick={()=>{const n=g.workers.filter(w=>!marks[w.id]).length;if(n&&confirm(`تسجيل حضور ${n} فرداً لدى ${g.name_ar}؟`))markAll(g,'full',true);}} disabled={!g.workers.some(w=>!marks[w.id])||busy==='group-'+g.id}>حضور الباقين</button>
            <button className="btn ghost" onClick={()=>closeAttendance(g)} disabled={!g.workers.some(w=>!marks[w.id])}>غياب غير المسجلين</button>
            {registeredAll>0&&<button className="btn ghost" style={{borderColor:'#d9a8a5',color:'#9d2f2b'}} onClick={()=>clearContractorAttendance(g)} disabled={busy==='clear-'+g.id}>إلغاء تسجيلات اليوم ({registeredAll})</button>}
            <button className="btn ghost" onClick={()=>openWorkers(g)}>إضافة عمال</button>
            <button className="btn ghost" onClick={()=>openOutput(g)}>تسجيل إنجاز</button>
            <button className="btn ghost" onClick={()=>openMovement(g)}>حركة مالية</button>
          </div>

          <div className={styles.cardGrid}>
            <div className={styles.attendance}>
              <div className={styles.blockHead}><div><b>الحضور</b><span>{pending.length} ينتظر التسجيل · {done.length} مكتمل</span></div><input placeholder="بحث سريع بالاسم" value={workerSearch} onChange={e=>setWorkerSearch(e.target.value)}/></div>
              {g.workers.length===0?<div className={styles.softEmpty}>لا توجد عمالة مسندة. استخدم «إضافة عمال» والصق قائمة الأسماء مرة واحدة.</div>:<>
                <div className={styles.workerGrid}>{pending.map(w=><WorkerRow key={w.id} worker={w} busy={busy==='att-'+w.id} onMark={markWorker} onMove={()=>setPanel({type:'move',worker:w,form:{contractor_id:g.id,effective_from:date,notes:''}})}/>)}</div>
                {done.length>0&&<details className={styles.done}><summary>تم التسجيل ({done.length})</summary><div className={styles.doneGrid}>{done.map(w=><div key={w.id} className={styles.doneWorker}><button type="button" className={styles.statusBadge} onClick={()=>{const ks=['full','half','absent','stopped','leave'],cur=marks[w.id]?.status;markWorker(w,ks[(ks.indexOf(cur)+1)%ks.length]);}}>{STATUS[marks[w.id]?.status]?.short||'؟'}</button><span>{w.full_name}</span><button type="button" onClick={()=>removeAttendance(w)} disabled={busy==='undo-'+w.id} style={{color:'#9d2f2b'}}>إلغاء</button><button type="button" onClick={()=>setPanel({type:'move',worker:w,form:{contractor_id:g.id,effective_from:date,notes:''}})}>نقل</button></div>)}</div></details>}
              </>}
            </div>

            <div className={styles.today}>
              <div className={styles.blockHead}><div><b>حركات اليوم</b><span>من نفس السياق، بلا إعادة اختيار المشروع والمقاول</span></div></div>
              <TodayList group={g} items={items}/>
            </div>
          </div>
        </section>;
      })}
    </>}

    {panel?.type==='attach'&&<Drawer title="إضافة مقاول للمشروع" onClose={()=>setPanel(null)}><div className={styles.choiceList}>{unattached.length?unattached.map(c=><button key={c.id} onClick={()=>attachContractor(c.id)} disabled={busy==='attach'}><b>{c.name_ar}</b><span>{c.operation_alias||c.default_basis||'إعداداته ستنتقل للمشروع'}</span></button>):<div className={styles.softEmpty}>كل المقاولين النشطين مرتبطون بالمشروع.</div>}</div></Drawer>}

    {panel?.type==='workers'&&<Drawer title={`إضافة عمال — ${contractors.find(x=>x.id===panel.contractorId)?.name_ar||''}`} onClose={()=>setPanel(null)}><form onSubmit={addWorkers}>
      <div className={styles.workerPaste}><label>الأسماء — كل اسم في سطر</label><textarea autoFocus rows="8" value={panel.form.names} onChange={e=>setPanel(p=>({...p,form:{...p.form,names:e.target.value}}))} placeholder={'أحمد محمد\nحسن علي\nمصطفى عمر'}/><span>يمكن لصق عشرات الأسماء دفعة واحدة. الاسم الموجود لدى مقاول آخر لن يتكرر؛ سيظهر كحالة تحتاج نقل.</span></div>
      <div className="form-grid">
        <Field label="التصنيف"><select value={panel.form.labor_class} onChange={e=>setPanel(p=>({...p,form:{...p.form,labor_class:e.target.value,rate:e.target.value==='technician'?(contractors.find(x=>x.id===p.contractorId)?.tech_daily||''):(contractors.find(x=>x.id===p.contractorId)?.worker_daily||'')}}))}><option value="worker">عامل</option><option value="technician">صنايعي</option><option value="foreman">فورمان</option></select></Field>
        <Field label="التخصص"><input value={panel.form.trade} onChange={e=>setPanel(p=>({...p,form:{...p.form,trade:e.target.value}}))} placeholder="مثال: نجار"/></Field>
        <Field label="أساس الأجر"><select value={panel.form.pay_basis} onChange={e=>setPanel(p=>({...p,form:{...p.form,pay_basis:e.target.value}}))}><option value="daily">يومية</option><option value="salary">راتب شهري</option><option value="piecework">بالوحدة</option></select></Field>
        {panel.form.pay_basis==='daily'&&<Field label="اليومية"><input type="number" step="0.01" value={panel.form.rate} onChange={e=>setPanel(p=>({...p,form:{...p.form,rate:e.target.value}}))}/></Field>}
        {panel.form.pay_basis==='salary'&&<><Field label="الراتب الشهري"><input type="number" step="0.01" value={panel.form.salary} onChange={e=>setPanel(p=>({...p,form:{...p.form,salary:e.target.value}}))}/></Field><Field label="القسمة على"><input type="number" min="1" max="31" value={panel.form.salary_days} onChange={e=>setPanel(p=>({...p,form:{...p.form,salary_days:e.target.value}}))}/></Field></>}
        {panel.form.pay_basis==='piecework'&&<><Field label="سعر الوحدة"><input type="number" step="0.01" value={panel.form.piece_rate} onChange={e=>setPanel(p=>({...p,form:{...p.form,piece_rate:e.target.value}}))}/></Field><Field label="الوحدة"><input value={panel.form.piece_unit} onChange={e=>setPanel(p=>({...p,form:{...p.form,piece_unit:e.target.value}}))}/></Field></>}
        <Field label="من تاريخ"><input type="date" value={panel.form.effective_from} onChange={e=>setPanel(p=>({...p,form:{...p.form,effective_from:e.target.value}}))}/></Field>
      </div>
      <div className="rowsplit"><button className="btn" disabled={busy==='workers'}>{busy==='workers'?'جارٍ الإضافة…':'إضافة القائمة'}</button></div>
    </form></Drawer>}

    {panel?.type==='move'&&<Drawer title={`نقل العامل — ${panel.worker.full_name}`} onClose={()=>setPanel(null)}><form onSubmit={moveWorker}><div className="form-grid">
      <Field label="إلى المقاول"><select required value={panel.form.contractor_id} onChange={e=>setPanel(p=>({...p,form:{...p.form,contractor_id:e.target.value}}))}>{allContractors.map(c=><option key={c.id} value={c.id}>{c.name_ar}</option>)}</select></Field>
      <Field label="اعتباراً من"><input required type="date" value={panel.form.effective_from} onChange={e=>setPanel(p=>({...p,form:{...p.form,effective_from:e.target.value}}))}/></Field>
      <div className="field span2"><label>ملاحظة</label><input value={panel.form.notes} onChange={e=>setPanel(p=>({...p,form:{...p.form,notes:e.target.value}}))}/></div>
    </div><div className="msg" style={{marginTop:8}}>لن تتغير الأيام السابقة؛ سيُغلق الإسناد القديم قبل تاريخ النقل.</div><div className="rowsplit"><button className="btn" disabled={busy==='move'}>تأكيد النقل</button></div></form></Drawer>}

    {panel?.type==='output'&&<Drawer title={`إنجاز اليوم — ${contractors.find(x=>x.id===panel.contractorId)?.name_ar||''}`} onClose={()=>setPanel(null)}><form onSubmit={saveOutputPanel}><div className="form-grid">
      <div className="field span2"><label>البند</label><select required value={panel.form.item_id} onChange={e=>setPanel(p=>({...p,form:{...p.form,item_id:e.target.value}}))}>{(panel.pool||items).map(i=><option key={i.id} value={i.id}>{i.description_ar} — {i.unit||''}</option>)}</select></div>
      <Field label="الكمية"><input autoFocus required type="number" min="0" step="any" value={panel.form.qty} onChange={e=>setPanel(p=>({...p,form:{...p.form,qty:e.target.value}}))}/></Field>
      <Field label="ملاحظة"><input value={panel.form.notes} onChange={e=>setPanel(p=>({...p,form:{...p.form,notes:e.target.value}}))}/></Field>
    </div><div className="rowsplit"><button className="btn" disabled={busy==='output'}>حفظ الإنجاز</button></div></form></Drawer>}

    {panel?.type==='movement'&&<Drawer title={`حركة مالية — ${contractors.find(x=>x.id===panel.contractorId)?.name_ar||''}`} onClose={()=>setPanel(null)}><form onSubmit={saveMovement}>
      <div className={styles.movementKinds}>{[['expense','مصروف'],['advance','سلفة'],['payment','دفعة']].map(([k,t])=><button type="button" key={k} className={panel.form.kind===k?styles.on:''} onClick={()=>setPanel(p=>({...p,form:{...p.form,kind:k}}))}>{t}</button>)}</div>
      <div className="form-grid">
        <Field label="المبلغ"><input autoFocus required type="number" min="0" step="0.01" value={panel.form.amount} onChange={e=>setPanel(p=>({...p,form:{...p.form,amount:e.target.value}}))}/></Field>
        {panel.form.kind==='expense'&&<><div className="field span2"><label>البيان</label><input required value={panel.form.notes} onChange={e=>movementDescription(e.target.value)} placeholder="مثال: بنزين سيارة الموقع"/></div><Field label="التصنيف"><select value={panel.form.category} onChange={e=>{const cat=e.target.value,c=contractors.find(x=>x.id===panel.contractorId);setPanel(p=>({...p,form:{...p.form,category:cat,charge_to:chargeFor(c,cat)}}))}}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="من دفع؟"><select value={panel.form.payer} onChange={e=>setPanel(p=>({...p,form:{...p.form,payer:e.target.value}}))}>{Object.entries(PAYER_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field><Field label="على من؟"><select value={panel.form.charge_to} onChange={e=>setPanel(p=>({...p,form:{...p.form,charge_to:e.target.value}}))}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field><Field label="طبيعة المبلغ"><select value={panel.form.is_recoverable?'1':'0'} onChange={e=>setPanel(p=>({...p,form:{...p.form,is_recoverable:e.target.value==='1',project_item_id:e.target.value==='1'?'':p.form.project_item_id}}))}><option value="0">مصروف نهائي</option><option value="1">مسترد / تأمين / عهدة</option></select></Field>{!panel.form.is_recoverable&&<Field label="البند إن كان مباشراً"><select value={panel.form.project_item_id} onChange={e=>setPanel(p=>({...p,form:{...p.form,project_item_id:e.target.value}}))}><option value="">لا يربط ببند</option>{items.map(i=><option key={i.id} value={i.id}>{i.description_ar}</option>)}</select></Field>}</>}
        {panel.form.kind==='advance'&&<div className="field span2"><label>البيان</label><input value={panel.form.notes} onChange={e=>setPanel(p=>({...p,form:{...p.form,notes:e.target.value}}))} placeholder="سبب السلفة أو مرجعها"/></div>}
        {panel.form.kind==='payment'&&<><Field label="طريقة الدفع"><select value={panel.form.source} onChange={e=>setPanel(p=>({...p,form:{...p.form,source:e.target.value}}))}>{Object.entries(SOURCE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field><Field label="المرجع"><input value={panel.form.reference} onChange={e=>setPanel(p=>({...p,form:{...p.form,reference:e.target.value}}))}/></Field><div className="field span2"><label>ملاحظة</label><input value={panel.form.notes} onChange={e=>setPanel(p=>({...p,form:{...p.form,notes:e.target.value}}))}/></div></>}
      </div><div className="rowsplit"><button className="btn" disabled={busy==='movement'}>حفظ الحركة</button></div>
    </form></Drawer>}
  </div>;
}

function Stat({label,value,suffix='',alert=false}){return <div className={`${styles.stat} ${alert?styles.statAlert:''}`}><span>{label}</span><b>{value}{suffix&&<small> {suffix}</small>}</b></div>;}
function Field({label,children}){return <div className="field"><label>{label}</label>{children}</div>;}
function Drawer({title,onClose,children}){return <div className={styles.overlay} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={styles.drawer}><header><h2>{title}</h2><button type="button" onClick={onClose}>إغلاق</button></header><div className={styles.drawerBody}>{children}</div></div></div>;}
function WorkerRow({worker,onMark,onMove,busy}){return <div className={styles.worker}><div><b>{worker.full_name}</b><span>{worker.trade||({worker:'عامل',technician:'صنايعي',foreman:'فورمان'}[worker.labor_class]||'—')}</span></div><div className={styles.workerButtons}><button disabled={busy} onClick={()=>onMark(worker,'full')}>كامل</button><button disabled={busy} onClick={()=>onMark(worker,'half')}>نصف</button><button disabled={busy} onClick={()=>onMark(worker,'absent')}>غياب</button><button onClick={onMove}>نقل</button></div></div>;}
function TodayList({group,items}){
  const rows=[
    ...group.outputs.map(x=>({k:'إنجاز',v:`${items.find(i=>i.id===x.project_item_id)?.description_ar||'بند'} — ${x.group_output} ${x.unit||''}`})),
    ...group.expenses.map(x=>({k:x.is_recoverable?'مبلغ مسترد':x.category,v:`${money(x.amount)} ر.س${x.notes?` — ${x.notes}`:''}`})),
    ...group.advances.map(x=>({k:'سلفة',v:`${money(x.amount)} ر.س${x.notes?` — ${x.notes}`:''}`})),
    ...group.payments.map(x=>({k:'دفعة',v:`${money(x.amount)} ر.س${x.reference?` — ${x.reference}`:''}`})),
  ];
  if(!rows.length)return <div className={styles.softEmpty}>لا توجد حركات أخرى لهذا المقاول اليوم.</div>;
  return <div className={styles.todayList}>{rows.map((x,i)=><div key={i}><b>{x.k}</b><span>{x.v}</span></div>)}</div>;
}
function CommandPreview({value,setValue,onConfirm,busy}){
  if(value.kind==='unknown'||value.kind==='need')return <div className={styles.previewWarn}><b>{value.kind==='need'?'الحركة شبه مكتملة':'أحتاج صياغة أوضح'}</b><span>{value.message}</span>{value.choices?.length>0&&<div>{value.choices.slice(0,4).map(x=><span key={x.id} className="pill">{x.full_name||x.name_ar}</span>)}</div>}</div>;
  const labels={
    attendance:`تسجيل ${STATUS[value.status]?.ar} — ${value.worker?.full_name}`,
    bulk_attendance:`تسجيل حضور الباقين — ${value.contractor?.name_ar}`,
    output:`إضافة ${value.qty} ${value.unit||''} — ${value.item?.description_ar} — ${value.contractor?.name_ar}`,
    expense:`مصروف ${money(value.amount)} ر.س — ${value.category} — ${value.contractor?.name_ar}`,
    advance:`سلفة ${money(value.amount)} ر.س — ${value.contractor?.name_ar}`,
    payment:`دفعة ${money(value.amount)} ر.س — ${value.contractor?.name_ar}`,
    transfer:`نقل ${value.worker?.full_name} إلى ${value.contractor?.name_ar}`,
  };
  return <div className={styles.preview}><div><b>المعاينة قبل الحفظ</b><span>{labels[value.kind]||value.kind}</span>
    {value.kind==='expense'&&<small>دفع: {PAYER_AR[value.payer]} · على: {CHARGE_AR[value.charge_to]}{value.is_recoverable?' · مبلغ مسترد':''}</small>}
    {value.kind==='payment'&&<small>طريقة الدفع: {SOURCE_AR[value.source]||value.source}</small>}
    {value.kind==='transfer'&&<small>من تاريخ {value.effective_from}</small>}
  </div><div><button type="button" className="btn ghost" onClick={()=>setValue(null)}>إلغاء</button><button type="button" className="btn" onClick={onConfirm} disabled={busy}>{busy?'جارٍ الحفظ…':'تأكيد'}</button></div></div>;
}
