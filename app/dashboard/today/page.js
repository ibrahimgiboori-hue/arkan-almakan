'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';

const CLOSED = new Set(['completed','closed','cancelled']);
const STATUS_AR = {new:'جديد',received:'مستلم',in_progress:'قيد الإنجاز',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',cancelled:'ملغي'};
const TYPE_AR = {personal_task:'مهمة شخصية',task:'مهمة',request:'مراسلة / طلب'};

function dateKey(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Riyadh'}).format(value instanceof Date?value:new Date(value));
}
function taskProject(task){return task.projects?.name_ar||task.projects?.project_no||'';}

export default function TodayPage(){
  const [state,setState]=useState(null);const [err,setErr]=useState('');
  useEffect(()=>{let alive=true;(async()=>{setErr('');const session=(await supabase.auth.getSession()).data.session;if(!session)return;const uid=session.user.id;
    const [userQ,tasksQ,notificationsQ,capsQ,projectsQ]=await Promise.all([
      supabase.from('app_users').select('employees(full_name_ar,job_title)').eq('id',uid).maybeSingle(),
      supabase.from('workspace_tasks').select('id,task_type,title,description,creator_user_id,assignee_user_id,status,priority,progress,due_at,project_id,created_at,last_activity_at,projects(id,project_no,name_ar)').order('last_activity_at',{ascending:false}).limit(100),
      supabase.from('notifications').select('id,title,body,link,severity,is_read,created_at').order('created_at',{ascending:false}).limit(30),
      supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key'),
      supabase.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
    ]);if(!alive)return;const errors=[tasksQ.error,notificationsQ.error,capsQ.error,projectsQ.error].filter(Boolean);if(errors.length)setErr('تعذر تحميل بعض عناصر صفحة اليوم. المعروض يقتصر على البيانات المتاحة لحسابك.');
    setState({uid,employee:userQ.data?.employees||null,tasks:tasksQ.data||[],notifications:notificationsQ.data||[],capabilities:capsQ.data||[],projects:projectsQ.data||[]});})();return()=>{alive=false;};},[]);

  const view=useMemo(()=>{if(!state)return null;const today=dateKey();const active=state.tasks.filter(t=>!CLOSED.has(t.status));const overdue=active.filter(t=>t.due_at&&dateKey(t.due_at)<today);const dueToday=active.filter(t=>t.due_at&&dateKey(t.due_at)===today);const incoming=active.filter(t=>t.assignee_user_id===state.uid&&t.creator_user_id!==state.uid);const newIncoming=incoming.filter(t=>['new','received'].includes(t.status));const mine=active.filter(t=>t.task_type==='personal_task'||t.assignee_user_id===state.uid);const todayRows=[...new Map([...overdue,...dueToday,...newIncoming,...mine.filter(t=>['in_progress','waiting'].includes(t.status))].map(t=>[t.id,t])).values()].slice(0,8);
    const projectCaps=state.capabilities.filter(c=>c.module_key==='projects');const projectsPortal=projectCaps.some(c=>c.scope_type==='all');const projectRows=state.projects.map(project=>{const caps=projectCaps.filter(c=>c.scope_type==='all'||(c.scope_type==='project'&&c.scope_key===project.id));const keys=new Set(caps.map(c=>c.capability_key));const projectFull=projectsPortal||keys.has('projects.overview.view')||keys.has('projects.projects.view');return{...project,projectFull,attendance:keys.has('projects.timesheets.view'),expenses:keys.has('projects.expenses.view')};});
    return{overdue,dueToday,newIncoming,todayRows,unread:state.notifications.filter(n=>!n.is_read),projectsPortal,projectRows};},[state]);

  if(!state||!view)return <ConstitutionPage><EmptyState title="جارٍ تجهيز يومك" description="يتم جمع ما يحتاج انتباهك والتنبيهات ونطاق العمل المسموح."/></ConstitutionPage>;
  const empName=state.employee?.full_name_ar||'المستخدم';
  return <ConstitutionPage>
    <PageHeader eyebrow="TODAY" title={`اليوم — ${empName}`} description="ملخص سريع لما يحتاج انتباهك الآن. التفاصيل والمحادثات والمتابعة الكاملة موجودة في أعمالي." actions={<Link className="btn" href="/dashboard/my-work">فتح أعمالي ←</Link>}/>
    {err&&<Notice tone="warning">{err}</Notice>}

    <Section title="ما يحتاج انتباهك الآن" actions={<Link className="btn ghost" href="/dashboard/my-work">كل الأعمال</Link>}><div className="grid k4"><div className="card"><h3>وارد جديد</h3><div className="big">{view.newIncoming.length}</div><div className="foot">مهام ومراسلات من الآخرين</div></div><div className="card"><h3>متأخر</h3><div className="big">{view.overdue.length}</div><div className="foot">تجاوز موعده ولم يُغلق</div></div><div className="card"><h3>موعد اليوم</h3><div className="big">{view.dueToday.length}</div><div className="foot">مطلوب التعامل معه اليوم</div></div><div className="card"><h3>تنبيهات جديدة</h3><div className="big">{view.unread.length}</div><div className="foot">تنبيهات شخصية غير مقروءة</div></div></div></Section>

    <Section title="أعمال اليوم" description="أهم العناصر فقط؛ افتح أعمالي للمحادثة والتقدم والمرفقات والخطابات.">
      {view.todayRows.length===0?<EmptyState title="لا يوجد شيء عاجل الآن" description="يمكنك إنشاء مهمة شخصية أو مراجعة أعمالك الكاملة من صفحة أعمالي."/>:<div style={{display:'grid',gap:8}}>{view.todayRows.map(task=><div key={task.id} style={{border:'1px solid var(--hair)',borderRadius:10,padding:'12px 14px'}}><div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'flex-start'}}><div><strong>{task.title}</strong>{task.description&&<div className="hint" style={{marginTop:4}}>{task.description}</div>}</div><span>{STATUS_AR[task.status]||task.status}</span></div><div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:9,fontSize:12,opacity:.75}}><span>{TYPE_AR[task.task_type]||'عمل'}</span>{taskProject(task)&&<span>المشروع: {taskProject(task)}</span>}{task.due_at&&<span>الموعد: {dateKey(task.due_at)}</span>}<span>الإنجاز: {task.progress||0}%</span></div></div>)}</div>}
      <div style={{marginTop:12}}><Link className="btn" href="/dashboard/my-work">فتح المحادثات والتفاصيل في أعمالي ←</Link></div>
    </Section>

    <Section title="بواباتي ونطاق عملي" description="هذا انعكاس للصلاحيات الممنوحة لك فقط؛ صفحة اليوم لا تمنح صلاحيات جديدة.">
      {view.projectsPortal&&<div className="msg ok" style={{marginBottom:12}}>لديك كامل <strong>بوابة المشاريع</strong> بما فيها إنشاء مشروع جديد وإدارة جميع أدواتها. <Link href="/dashboard/projects"><strong>فتح بوابة المشاريع ←</strong></Link></div>}
      {view.projectRows.length===0?<EmptyState title="لا توجد مشاريع ضمن نطاقك" description="ستظهر هنا المشاريع أو أدوات الموقع فور إسناد صلاحية لك."/>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>{view.projectRows.map(project=><div key={project.id} className="section" style={{margin:0,padding:16}}><div style={{fontSize:12,opacity:.7}}>{project.project_no||'—'}</div><h3 style={{margin:'5px 0 4px'}}>{project.name_ar}</h3><div className="hint">{project.city||'الموقع غير محدد'}</div><div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:14}}>{project.projectFull&&<Link className="btn" href={`/dashboard/projects/${project.id}`}>فتح المشروع</Link>}{!project.projectFull&&project.attendance&&<Link className="btn" href={`/dashboard/projects/${project.id}/operations`}>الحضور</Link>}{!project.projectFull&&project.expenses&&<Link className="btn ghost" href={`/dashboard/projects/${project.id}/operations/expenses`}>المصروفات</Link>}</div></div>)}</div>}
    </Section>

    <Section title="آخر التنبيهات الشخصية">{state.notifications.length===0?<EmptyState title="لا توجد تنبيهات" description="ستظهر هنا التنبيهات التي تخص حسابك فقط."/>:<div style={{display:'grid',gap:8}}>{state.notifications.slice(0,6).map(item=><div key={item.id} style={{border:'1px solid var(--hair)',borderRadius:10,padding:'11px 13px',opacity:item.is_read?.7:1}}><strong>{item.title}</strong>{item.body&&<div className="hint">{item.body}</div>}{item.link&&<Link href={item.link} style={{display:'inline-block',marginTop:5}}>فتح ←</Link>}</div>)}</div>}</Section>
  </ConstitutionPage>;
}
