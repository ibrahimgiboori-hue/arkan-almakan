import { supabase } from '@/lib/supabase';

function fail(error,fallback){
  if(error)throw new Error(error.message || fallback);
}

export const projectInsightsSupabaseRepository=Object.freeze({
  async loadAccessContext(projectId){
    const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
    fail(sessionError,'تعذر قراءة جلسة المستخدم.');
    const userId=sessionData?.session?.user?.id || null;
    if(!userId)return Object.freeze({authenticated:false,userId:null,isSystemAdmin:false,capabilities:[],primary:false,project:null});

    const [userQ,capsQ,primaryQ,projectQ]=await Promise.all([
      supabase.from('app_users').select('is_system_admin').eq('id',userId).maybeSingle(),
      supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key,source_key')
        .or(`scope_type.eq.all,and(scope_type.eq.project,scope_key.eq.${projectId})`),
      supabase.rpc('fn_is_primary_user'),
      supabase.from('projects').select('id,project_no,name_ar,city,stage').eq('id',projectId).maybeSingle(),
    ]);
    const firstError=[userQ,capsQ,primaryQ,projectQ].find((result)=>result.error)?.error;
    fail(firstError,'تعذر التحقق من صلاحيات قسم المشروع.');
    return Object.freeze({
      authenticated:true,
      userId,
      isSystemAdmin:Boolean(userQ.data?.is_system_admin),
      capabilities:capsQ.data || [],
      primary:primaryQ.data===true,
      project:projectQ.data || null,
    });
  },

  async loadPlanning(projectId){
    const [itemsQ,durationQ,timingQ]=await Promise.all([
      supabase.from('project_items').select('id,sort_order,description_ar,unit,contract_qty,budget_cost,contract_value')
        .eq('project_id',projectId).order('sort_order'),
      supabase.from('v_item_duration').select('project_item_id,days_spent,first_day,last_day,total_output')
        .eq('project_id',projectId),
      supabase.from('project_cashflow_timing').select('project_item_id,forecast_start_date,forecast_end_date,distribution,note')
        .eq('project_id',projectId),
    ]);
    const error=itemsQ.error || durationQ.error || timingQ.error;
    fail(error,'تعذر تحميل بيانات التخطيط.');
    return Object.freeze({items:itemsQ.data || [],durations:durationQ.data || [],timing:timingQ.data || []});
  },

  async loadCostControl(projectId){
    const [financialQ,snapshotsQ]=await Promise.all([
      supabase.from('v_project_financials').select('*').eq('project_id',projectId).maybeSingle(),
      supabase.from('project_financial_snapshots')
        .select('snapshot_at,label,current_contract_value,earned_value,known_actual_cost,cost_to_complete,current_result,expected_result,unallocated_cost,progress_pct,next_4w_outflow,next_4w_inflow,peak_funding_pressure')
        .eq('project_id',projectId).order('snapshot_at',{ascending:false}).limit(24),
    ]);
    fail(financialQ.error || snapshotsQ.error,'تعذر تحميل بيانات التحكم المالي.');
    return Object.freeze({financial:financialQ.data || null,snapshots:snapshotsQ.data || []});
  },

  async loadChanges(projectId){
    const {data,error}=await supabase.from('change_orders')
      .select('id,co_number,co_date,description,reason,status,owner_ref,duration_days,approved_at,created_at')
      .eq('project_id',projectId).order('co_date',{ascending:false});
    fail(error,'تعذر تحميل أوامر التغيير.');
    return Object.freeze({changes:data || []});
  },

  async loadCorrespondence(projectId){
    const [siteQ,docsQ]=await Promise.all([
      supabase.from('site_documents').select('id,doc_kind,doc_date,title,description,file_path,created_at')
        .eq('project_id',projectId).order('doc_date',{ascending:false}).limit(100),
      supabase.from('documents').select('id,doc_number,subject,status,issued_at,sent_at,created_at')
        .eq('project_id',projectId).order('created_at',{ascending:false}).limit(100),
    ]);
    fail(siteQ.error || docsQ.error,'تعذر تحميل المراسلات الفنية.');
    return Object.freeze({siteDocs:siteQ.data || [],documents:docsQ.data || []});
  },
});
