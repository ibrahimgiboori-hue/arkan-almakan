import { supabase } from '@/lib/supabase';

function num(value){ return Number(value || 0); }
function sum(rows,key){ return (rows||[]).reduce((total,row)=>total+num(row?.[key]),0); }
function money(value){ return `${num(value).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`; }
function date(value){ return value ? new Date(value).toLocaleDateString('ar-SA') : '—'; }
function status(value){
  const map={draft:'مسودة',pending:'قيد الانتظار',submitted:'مرسل',approved:'معتمد',rejected:'مرفوض',returned:'معاد',paid:'مصروف',closed:'مغلق',open:'مفتوح',active:'نشط',inactive:'غير نشط',matched:'مطابق',unmatched:'غير مطابق',partial:'جزئي',completed:'مكتمل'};
  return map[String(value||'').toLowerCase()] || value || '—';
}
function summaryItem(key,label,value,note){ return {key,label,value,note}; }
function table(columns,rows,summary=[],note=''){ return {columns,rows,summary,note}; }

async function namesByEmployeeIds(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length)return new Map();
  const {data}=await supabase.from('employees').select('id,full_name_ar').in('id',unique);
  return new Map((data||[]).map(row=>[row.id,row.full_name_ar||'—']));
}

async function hrPayroll(){
  const {data,error}=await supabase.from('payroll_runs').select('id,run_month,status,total_gross,total_deductions,total_net,approved_at,created_at').order('run_month',{ascending:false}).limit(36);
  if(error)throw error;
  const rows=data||[];
  const latest=rows[0];
  return table(
    ['الشهر','الحالة','الإجمالي','الخصومات','الصافي','الاعتماد'],
    rows.map(r=>[r.run_month||'—',status(r.status),money(r.total_gross),money(r.total_deductions),money(r.total_net),date(r.approved_at)]),
    [summaryItem('runs','الدورات',rows.length,'المسجلة في النظام'),summaryItem('latest','آخر دورة',latest?.run_month||'—',status(latest?.status)),summaryItem('net','صافي آخر دورة',latest?money(latest.total_net):'—','حسب آخر دورة مسجلة')],
    'إعداد الرواتب يستفيد من بيانات الموظفين والسلف والجزاءات ومكونات الراتب الموجودة أصلًا؛ إجراءات الإنشاء والحساب ستدخل في مسرح الإدخال لاحقًا.'
  );
}

async function hrCompliance(){
  const [{data:docs,error:docsErr},{data:employees,error:empErr}]=await Promise.all([
    supabase.from('employee_documents').select('id,employee_id,doc_type,doc_number,expiry_date,alert_days_before').order('expiry_date',{ascending:true}),
    supabase.from('employees').select('id,full_name_ar,id_expiry,status').order('full_name_ar'),
  ]);
  if(docsErr)throw docsErr;if(empErr)throw empErr;
  const today=new Date();today.setHours(0,0,0,0);
  const normalized=[...(docs||[]).map(d=>({...d,employee_name:(employees||[]).find(e=>e.id===d.employee_id)?.full_name_ar||'—'})),...(employees||[]).filter(e=>e.id_expiry).map(e=>({id:`identity-${e.id}`,employee_id:e.id,employee_name:e.full_name_ar,doc_type:'الهوية / الإقامة',doc_number:'—',expiry_date:e.id_expiry,alert_days_before:60}))];
  const days=(value)=>value?Math.ceil((new Date(value).setHours(0,0,0,0)-today.getTime())/86400000):null;
  const expired=normalized.filter(r=>days(r.expiry_date)!==null&&days(r.expiry_date)<0).length;
  const due=normalized.filter(r=>days(r.expiry_date)!==null&&days(r.expiry_date)>=0&&days(r.expiry_date)<=60).length;
  return table(
    ['الموظف','الوثيقة','الرقم','الانتهاء','الحالة'],
    normalized.sort((a,b)=>String(a.expiry_date||'9999').localeCompare(String(b.expiry_date||'9999'))).map(r=>{const d=days(r.expiry_date);return [r.employee_name,r.doc_type||'وثيقة',r.doc_number||'—',date(r.expiry_date),d===null?'بدون تاريخ':d<0?`منتهية منذ ${Math.abs(d)} يوم`:d===0?'تنتهي اليوم':`${d} يوم متبقي`];}),
    [summaryItem('docs','الوثائق',normalized.length,'هوية/إقامة + وثائق الموظف'),summaryItem('expired','منتهية',expired,expired?'تحتاج معالجة':'لا توجد'),summaryItem('due','خلال 60 يوم',due,due?'تحتاج متابعة':'لا توجد')],
    'هذه المساحة تجمع الانتهاءات في مكان واحد بدل البحث داخل ملف كل موظف.'
  );
}

async function hrDisciplinary(){
  const {data,error}=await supabase.from('disciplinary_actions').select('id,action_no,employee_id,action_kind,violation_date,description,deduction_amount,suspension_days,status,created_at').order('violation_date',{ascending:false}).limit(100);
  if(error)throw error;const rows=data||[];const names=await namesByEmployeeIds(rows.map(r=>r.employee_id));
  return table(['الرقم','الموظف','الإجراء','تاريخ المخالفة','الخصم','الحالة'],rows.map(r=>[r.action_no||'—',names.get(r.employee_id)||'—',r.action_kind||'—',date(r.violation_date),money(r.deduction_amount),status(r.status)]),[summaryItem('count','الإجراءات',rows.length,'المسجلة'),summaryItem('open','غير المغلقة',rows.filter(r=>!['closed','completed'].includes(String(r.status||'').toLowerCase())).length,'تحتاج متابعة'),summaryItem('deductions','إجمالي الخصومات',money(sum(rows,'deduction_amount')),'حسب السجل الحالي')]);
}

async function hrEndService(){
  const {data,error}=await supabase.from('end_of_service').select('id,settlement_no,employee_id,last_working_day,reason,eos_amount,unused_leave_amount,outstanding_debt,net_settlement,clearance_done,status,created_at').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;const rows=data||[];const names=await namesByEmployeeIds(rows.map(r=>r.employee_id));
  return table(['التسوية','الموظف','آخر يوم','السبب','الصافي','المخالصة','الحالة'],rows.map(r=>[r.settlement_no||'—',names.get(r.employee_id)||'—',date(r.last_working_day),r.reason||'—',money(r.net_settlement),r.clearance_done?'مكتملة':'غير مكتملة',status(r.status)]),[summaryItem('count','التسويات',rows.length,'المسجلة'),summaryItem('open','قيد الإجراء',rows.filter(r=>!['closed','paid','completed'].includes(String(r.status||'').toLowerCase())).length,'غير مغلقة'),summaryItem('net','صافي التسويات',money(sum(rows,'net_settlement')),'إجمالي السجل')]);
}

async function hrPerformance(){
  const {data,error}=await supabase.from('candidate_probation_reviews').select('id,onboarding_id,review_day,scheduled_date,performance_score,attendance_score,behavior_score,technical_score,overall_score,recommendation,improvement_plan,status,completed_at').order('scheduled_date',{ascending:false}).limit(100);
  if(error)throw error;const rows=data||[];
  return table(['يوم المراجعة','الموعد','النتيجة','التوصية','الحالة','الإكمال'],rows.map(r=>[r.review_day||'—',date(r.scheduled_date),r.overall_score??'—',r.recommendation||'—',status(r.status),date(r.completed_at)]),[summaryItem('count','المراجعات',rows.length,'فترة التجربة'),summaryItem('pending','قيد المتابعة',rows.filter(r=>!r.completed_at).length,'لم تكتمل'),summaryItem('completed','مكتملة',rows.filter(r=>r.completed_at).length,'مراجعة منتهية')], 'البنية الحالية قوية لفترة التجربة. تقييم الأداء الدوري للموظفين الدائمين يمكن إضافته لاحقًا فوق نفس منطق المراجعات دون خلطه بالتجربة.');
}

async function hrPlanning(){
  const [{data:vacancies,error:vErr},{data:positions,error:pErr},{data:employees,error:eErr}]=await Promise.all([
    supabase.from('job_vacancies').select('id,vacancy_no,title_ar,department,headcount,status,target_city,required_start_within_days,created_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('org_positions').select('id,is_active'),
    supabase.from('employees').select('id,status'),
  ]);if(vErr)throw vErr;if(pErr)throw pErr;if(eErr)throw eErr;
  const rows=vacancies||[];const open=rows.filter(r=>!['closed','cancelled','filled'].includes(String(r.status||'').toLowerCase()));
  return table(['رقم الشاغر','المسمى','القسم','العدد','المدينة','الحالة'],rows.map(r=>[r.vacancy_no||'—',r.title_ar||'—',r.department||'—',r.headcount||1,r.target_city||'—',status(r.status)]),[summaryItem('open','الشواغر المفتوحة',open.length,'احتياج نشط'),summaryItem('headcount','العدد المطلوب',open.reduce((s,r)=>s+num(r.headcount||1),0),'في الشواغر المفتوحة'),summaryItem('positions','المناصب النشطة',(positions||[]).filter(r=>r.is_active!==false).length,'في الهيكل'),summaryItem('employees','الموظفون النشطون',(employees||[]).filter(r=>String(r.status||'').toLowerCase()==='active').length,'حسب ملفات الموظفين')]);
}

async function financeCases(){
  const {data,error}=await supabase.from('financial_cases').select('id,case_no,source_type,source_department,source_label,project_id,counterparty_name,status,current_owner,current_version_no,created_at,updated_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;const rows=data||[];
  return table(['رقم المعاملة','المصدر','الطرف','الحالة','الإصدار','تاريخ الإنشاء'],rows.map(r=>[r.case_no||'—',r.source_label||r.source_type||'—',r.counterparty_name||'—',status(r.status),r.current_version_no||1,date(r.created_at)]),[summaryItem('count','المعاملات',rows.length,'المعروضة'),summaryItem('open','غير المغلقة',rows.filter(r=>!['closed','paid','completed'].includes(String(r.status||'').toLowerCase())).length,'تحتاج متابعة'),summaryItem('closed','مغلقة',rows.filter(r=>['closed','paid','completed'].includes(String(r.status||'').toLowerCase())).length,'منتهية')]);
}

async function financeTreasury(){
  const {data,error}=await supabase.from('v_treasury_balances').select('id,account_code,name_ar,account_type,bank_name,iban_masked,currency,current_balance,total_inflow,total_outflow,last_movement_at,is_active').order('account_code');if(error)throw error;const rows=data||[];
  const currencies=[...new Set(rows.map(r=>r.currency||'SAR'))];const single=currencies.length<=1;
  return table(['الكود','الحساب','النوع','البنك','العملة','الرصيد','آخر حركة'],rows.map(r=>[r.account_code||'—',r.name_ar||'—',r.account_type||'—',r.bank_name||'—',r.currency||'SAR',money(r.current_balance),date(r.last_movement_at)]),[summaryItem('accounts','الحسابات',rows.length,'بنك وصندوق'),summaryItem('active','النشطة',rows.filter(r=>r.is_active!==false).length,'متاحة للحركة'),summaryItem('balance','الرصيد',single?money(sum(rows,'current_balance')):'عملات متعددة',single?(currencies[0]||'SAR'):'لا يجمع بين العملات')]);
}

async function financeReconciliation(){
  const {data,error}=await supabase.from('bank_statement_entries').select('id,statement_date,value_date,direction,amount,description,bank_reference,match_status,matched_at,match_note').order('statement_date',{ascending:false}).limit(150);if(error)throw error;const rows=data||[];
  return table(['التاريخ','الاتجاه','المبلغ','البيان','مرجع البنك','المطابقة'],rows.map(r=>[date(r.statement_date),r.direction||'—',money(r.amount),r.description||'—',r.bank_reference||'—',status(r.match_status)]),[summaryItem('entries','حركات الكشف',rows.length,'المعروضة'),summaryItem('matched','مطابقة',rows.filter(r=>String(r.match_status||'').toLowerCase()==='matched').length,'مرتبطة بالحركة'),summaryItem('open','غير مطابقة',rows.filter(r=>String(r.match_status||'').toLowerCase()!=='matched').length,'تحتاج مراجعة')]);
}

async function financeDues(){
  const {data,error}=await supabase.from('v_employee_debt').select('employee_id,outstanding_debt').order('outstanding_debt',{ascending:false});if(error)throw error;const rows=(data||[]).filter(r=>num(r.outstanding_debt)!==0);const names=await namesByEmployeeIds(rows.map(r=>r.employee_id));
  return table(['الموظف','الرصيد المستحق'],rows.map(r=>[names.get(r.employee_id)||'—',money(r.outstanding_debt)]),[summaryItem('people','أرصدة قائمة',rows.length,'موظف لديه رصيد'),summaryItem('amount','إجمالي الرصيد',money(sum(rows,'outstanding_debt')),'حسب البيانات الحالية')], 'يمكن توسيع الذمم لاحقًا لتجميع الموظفين والمقاولين والعملاء في سجل أطراف واحد دون تغيير مصادرهم الأصلية.');
}

async function financeInvoices(){
  const {data,error}=await supabase.from('v_invoice_queue').select('claim_id,claim_no,project_name,client_name,gross_amount,vat_amount,net_payable,request_issued,invoice_uploaded,invoice_no,invoiced_at,collected_at,collected_amount').limit(150);if(error)throw error;const rows=data||[];
  const stateOf=r=>r.collected_at?'محصلة':r.invoice_uploaded||r.invoice_no?'مفوترة':r.request_issued?'طلب إصدار':'بانتظار الإصدار';
  return table(['المطالبة','المشروع','العميل','الإجمالي','الضريبة','الصافي','الحالة'],rows.map(r=>[r.claim_no||'—',r.project_name||'—',r.client_name||'—',money(r.gross_amount),money(r.vat_amount),money(r.net_payable),stateOf(r)]),[summaryItem('count','المطالبات',rows.length,'في قائمة الفوترة'),summaryItem('ready','بانتظار الفاتورة',rows.filter(r=>!r.invoice_uploaded&&!r.invoice_no).length,'تحتاج متابعة'),summaryItem('collection','المحصل',money(sum(rows,'collected_amount')),'حسب القائمة')]);
}

async function financeCashflow(){
  const {data,error}=await supabase.from('v_project_financials').select('project_no,name_ar,contract_value,earned_value,computed_progress_pct,claimed_gross,collected,pending_collection,direct_cost_known,current_profit,days_remaining').order('project_no');if(error)throw error;const rows=data||[];
  return table(['المشروع','الإنجاز','قيمة العقد','مكتسب','محصل','قيد التحصيل','التكلفة','النتيجة'],rows.map(r=>[`${r.project_no||''} ${r.name_ar||''}`.trim(),`${Math.round(num(r.computed_progress_pct))}%`,money(r.contract_value),money(r.earned_value),money(r.collected),money(r.pending_collection),money(r.direct_cost_known),money(r.current_profit)]),[summaryItem('projects','المشاريع',rows.length,'ضمن الرؤية المالية'),summaryItem('pending','قيد التحصيل',money(sum(rows,'pending_collection')),'مطالبات غير محصلة'),summaryItem('profit','النتيجة الحالية',money(sum(rows,'current_profit')),'قبل الإقفال النهائي')], 'هذه قراءة تشغيلية للسيولة وليست دفتر أستاذ محاسبيًا عامًا.');
}

async function financePayroll(){ return hrPayroll(); }

async function financeVat(){
  const {data,error}=await supabase.from('v_vat_summary').select('period,claims,taxable_base,vat_due,net_claimed,collected,collected_claims').order('period',{ascending:false}).limit(36);if(error)throw error;const rows=data||[];
  return table(['الفترة','المطالبات','الوعاء','الضريبة','الصافي','المحصل'],rows.map(r=>[r.period||'—',r.claims||0,money(r.taxable_base),money(r.vat_due),money(r.net_claimed),money(r.collected)]),[summaryItem('periods','الفترات',rows.length,'المعروضة'),summaryItem('vat','إجمالي الضريبة',money(sum(rows,'vat_due')),'حسب المطالبات'),summaryItem('collected','المحصل',money(sum(rows,'collected')),'حسب الفترات')]);
}

async function documentsReview(){
  const {data,error}=await supabase.from('documents').select('id,doc_number,subject,status,internal_approval_status,internal_approval_updated_at,issued_at,sent_at,created_at').order('created_at',{ascending:false}).limit(150);if(error)throw error;const rows=data||[];
  return table(['رقم المستند','الموضوع','حالة المستند','الاعتماد الداخلي','آخر تحديث'],rows.map(r=>[r.doc_number||'—',r.subject||'—',status(r.status),status(r.internal_approval_status),date(r.internal_approval_updated_at||r.created_at)]),[summaryItem('docs','المستندات',rows.length,'المعروضة'),summaryItem('pending','قيد الاعتماد',rows.filter(r=>['pending','submitted','in_review'].includes(String(r.internal_approval_status||'').toLowerCase())).length,'تحتاج قرار'),summaryItem('approved','معتمدة',rows.filter(r=>String(r.internal_approval_status||'').toLowerCase()==='approved').length,'اعتماد داخلي')]);
}

async function adminWorkflows(){
  const {data,error}=await supabase.from('approval_workflows').select('id,workflow_no,transaction_type,source_module,source_label,amount,currency,status,version_no,submitted_at,finalized_at,created_at').order('created_at',{ascending:false}).limit(150);if(error)throw error;const rows=data||[];
  return table(['رقم المسار','المعاملة','الوحدة','الوصف','المبلغ','الحالة','الإرسال'],rows.map(r=>[r.workflow_no||'—',r.transaction_type||'—',r.source_module||'—',r.source_label||'—',r.amount?money(r.amount):'—',status(r.status),date(r.submitted_at||r.created_at)]),[summaryItem('count','مسارات الاعتماد',rows.length,'المعروضة'),summaryItem('active','قيد الإجراء',rows.filter(r=>!r.finalized_at).length,'لم تنته'),summaryItem('done','منتهية',rows.filter(r=>r.finalized_at).length,'تم القرار')]);
}

async function adminAudit(){
  const {data,error}=await supabase.from('audit_log').select('id,table_name,record_id,action,actor_role,at').order('at',{ascending:false}).limit(200);if(error)throw error;const rows=data||[];
  return table(['الوقت','المصدر','العملية','صفة المنفذ'],rows.map(r=>[new Date(r.at).toLocaleString('ar-SA'),r.table_name||'—',r.action||'—',r.actor_role||'—']),[summaryItem('events','الحركات المعروضة',rows.length,'الأحدث'),summaryItem('sources','المصادر',new Set(rows.map(r=>r.table_name).filter(Boolean)).size,'جدول/مصدر'),summaryItem('writes','تغييرات',rows.filter(r=>!['SELECT','VIEW'].includes(String(r.action||'').toUpperCase())).length,'عمليات ذات أثر')], 'لا نعرض البيانات القديمة والجديدة الخام هنا؛ السجل الإداري يركز على الأثر ومن نفذه ومتى.');
}

async function adminCatalogs(){
  const [{data:sequences,error:sErr},{data:clauses,error:cErr}]=await Promise.all([
    supabase.from('number_sequences').select('key,prefix,current_value,pad,updated_at').order('key'),
    supabase.from('contract_clause_library').select('id,clause_key,title_ar,category,is_active,updated_at').order('category').limit(150),
  ]);if(sErr)throw sErr;if(cErr)throw cErr;
  const rows=[...(sequences||[]).map(r=>['تسلسل',r.key||'—',r.prefix||'—',r.current_value??'—',date(r.updated_at)]),...(clauses||[]).map(r=>['بند عقد',r.title_ar||r.clause_key||'—',r.category||'—',r.is_active===false?'غير نشط':'نشط',date(r.updated_at)])];
  return table(['النوع','الاسم','التصنيف / البادئة','القيمة / الحالة','آخر تحديث'],rows,[summaryItem('seq','التسلسلات',(sequences||[]).length,'ترقيم تلقائي'),summaryItem('clauses','بنود العقود',(clauses||[]).length,'في المكتبة'),summaryItem('active','بنود نشطة',(clauses||[]).filter(r=>r.is_active!==false).length,'متاحة للاستخدام')]);
}

const LOADERS={
  'hr-payroll':hrPayroll,
  'hr-compliance':hrCompliance,
  'hr-disciplinary':hrDisciplinary,
  'hr-end-service':hrEndService,
  'hr-performance':hrPerformance,
  'hr-planning':hrPlanning,
  'finance-cases':financeCases,
  'finance-treasury':financeTreasury,
  'finance-reconciliation':financeReconciliation,
  'finance-dues':financeDues,
  'finance-invoices':financeInvoices,
  'finance-cashflow':financeCashflow,
  'finance-payroll':financePayroll,
  'finance-vat':financeVat,
  'documents-review':documentsReview,
  'admin-workflows':adminWorkflows,
  'admin-audit':adminAudit,
  'admin-catalogs':adminCatalogs,
};

export async function loadPortalSectionData(dataKind){
  const loader=LOADERS[dataKind];
  if(!loader)throw new Error('لا يوجد مصدر بيانات معرف لهذا القسم.');
  return loader();
}
