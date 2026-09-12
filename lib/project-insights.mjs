import { money, dateAr } from './format.js';

export const PROJECT_INSIGHT_SECTIONS=Object.freeze({
  planning:Object.freeze({key:'planning',label:'التخطيط والجدولة'}),
  'cost-control':Object.freeze({key:'cost-control',label:'التحكم المالي'}),
  changes:Object.freeze({key:'changes',label:'التغييرات'}),
  correspondence:Object.freeze({key:'correspondence',label:'المراسلات الفنية'}),
});

const n=(value)=>Number(value || 0);

export function projectInsightStatus(value){
  const map={draft:'مسودة',pending:'قيد الانتظار',submitted:'مرسل',approved:'معتمد',rejected:'مرفوض',closed:'مغلق',active:'نشط',completed:'مكتمل'};
  return map[String(value || '').toLowerCase()] || value || '—';
}

export function projectInsightCanAccess({required=[],capabilities=[],primary=false,isSystemAdmin=false}){
  if(primary===true || isSystemAdmin===true)return true;
  if((capabilities || []).some((cap)=>cap?.source_key==='projects_full_access'))return true;
  if(!required.length)return true;
  const keys=new Set((capabilities || []).map((cap)=>cap?.capability_key));
  return required.some((key)=>keys.has(key));
}

export function projectPlanningInsight({items=[],durations=[],timing=[]}={}){
  const durationMap=new Map((durations || []).map((row)=>[row.project_item_id,row]));
  const timingMap=new Map((timing || []).map((row)=>[row.project_item_id,row]));
  const rows=(items || []).map((item)=>{
    const d=durationMap.get(item.id) || {};
    const t=timingMap.get(item.id) || {};
    return [
      item.sort_order ?? '—',item.description_ar || '—',item.contract_qty ?? '—',item.unit || '—',
      dateAr(t.forecast_start_date || d.first_day),dateAr(t.forecast_end_date || d.last_day),
      d.days_spent ?? '—',d.total_output ?? 0,
    ];
  });
  const planned=(timing || []).filter((row)=>row.forecast_start_date || row.forecast_end_date).length;
  return Object.freeze({
    summary:Object.freeze([
      {key:'items',label:'بنود المشروع',value:rows.length},
      {key:'planned',label:'لها توقيت',value:planned},
      {key:'started',label:'بدأ تنفيذها',value:(durations || []).filter((row)=>row.first_day).length},
    ]),
    columns:Object.freeze(['#','البند','الكمية','الوحدة','البداية','النهاية','أيام التنفيذ','المنجز']),
    rows:Object.freeze(rows),
  });
}

export function projectCostControlInsight({financial=null,snapshots=[]}={}){
  const f=financial || {};
  const rows=(snapshots || []).map((row)=>[
    dateAr(row.snapshot_at),row.label || 'لقطة مالية',`${Math.round(n(row.progress_pct))}%`,
    money(row.current_contract_value),money(row.earned_value),money(row.known_actual_cost),money(row.current_result),
    money(row.next_4w_inflow),money(row.next_4w_outflow),
  ]);
  return Object.freeze({
    summary:Object.freeze([
      {key:'contract',label:'قيمة العقد',value:money(f.contract_value)},
      {key:'earned',label:'القيمة المكتسبة',value:money(f.earned_value),note:`إنجاز ${Math.round(n(f.computed_progress_pct))}%`},
      {key:'cost',label:'التكلفة المعروفة',value:money(f.direct_cost_known)},
      {key:'result',label:'النتيجة الحالية',value:money(f.current_profit)},
    ]),
    columns:Object.freeze(['التاريخ','اللقطة','الإنجاز','العقد','المكتسب','التكلفة','النتيجة','داخل 4 أسابيع','خارج 4 أسابيع']),
    rows:Object.freeze(rows),
  });
}

export function projectChangesInsight(rows=[]){
  const list=rows || [];
  return Object.freeze({
    summary:Object.freeze([
      {key:'count',label:'أوامر التغيير',value:list.length},
      {key:'open',label:'غير معتمدة',value:list.filter((row)=>String(row.status || '').toLowerCase()!=='approved').length},
      {key:'days',label:'الأثر الزمني',value:`${list.reduce((sum,row)=>sum+n(row.duration_days),0)} يوم`},
    ]),
    columns:Object.freeze(['رقم التغيير','التاريخ','الوصف','السبب','الأثر الزمني','الحالة','اعتماد المالك']),
    rows:Object.freeze(list.map((row)=>[
      row.co_number || '—',dateAr(row.co_date),row.description || '—',row.reason || '—',`${n(row.duration_days)} يوم`,
      projectInsightStatus(row.status),row.owner_ref || dateAr(row.approved_at),
    ])),
  });
}

export function projectCorrespondenceInsight({siteDocs=[],documents=[]}={}){
  const site=siteDocs || [];
  const system=documents || [];
  const rows=[
    ...site.map((row)=>['مستند موقع',row.doc_kind || '—',row.title || '—',dateAr(row.doc_date || row.created_at),'—']),
    ...system.map((row)=>['مستند نظام',row.doc_number || '—',row.subject || '—',dateAr(row.issued_at || row.sent_at || row.created_at),projectInsightStatus(row.status)]),
  ];
  return Object.freeze({
    summary:Object.freeze([
      {key:'site',label:'مستندات الموقع',value:site.length},
      {key:'docs',label:'مستندات النظام',value:system.length},
      {key:'all',label:'الإجمالي',value:rows.length},
    ]),
    columns:Object.freeze(['المصدر','الرقم / النوع','الموضوع','التاريخ','الحالة']),
    rows:Object.freeze(rows),
  });
}

export function buildProjectInsight(sectionKey,source){
  if(sectionKey==='planning')return projectPlanningInsight(source);
  if(sectionKey==='cost-control')return projectCostControlInsight(source);
  if(sectionKey==='changes')return projectChangesInsight(source?.changes || []);
  if(sectionKey==='correspondence')return projectCorrespondenceInsight(source);
  throw new Error('قسم التحليل غير معروف.');
}
