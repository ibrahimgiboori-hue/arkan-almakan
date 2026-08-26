'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';

const CLOSED = new Set(['completed', 'closed']);
const STATUS_AR = {
  new: 'جديد', received: 'مستلم', in_progress: 'قيد الإنجاز', waiting: 'بانتظار إجراء', completed: 'مكتمل', closed: 'مغلق',
};
const PRIORITY_AR = { urgent:'عاجل', high:'مرتفع', normal:'عادي', low:'منخفض' };
const TABS = [
  ['today','اليوم'],
  ['inbox','الوارد إليّ'],
  ['tasks','مهامي'],
  ['sent','أرسلتها'],
  ['followup','المتابعة'],
  ['completed','المكتملة'],
];

function dateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Riyadh',
  }).format(value instanceof Date ? value : new Date(value));
}

function taskProject(task) {
  return task.projects?.name_ar || task.projects?.project_no || '';
}

export default function TodayPage() {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('today');

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const uid = session.user.id;
      const [userQ,tasksQ,notificationsQ,capsQ,projectsQ] = await Promise.all([
        supabase.from('app_users').select('employees(full_name_ar,job_title)').eq('id',uid).maybeSingle(),
        supabase.from('workspace_tasks')
          .select('id,task_type,title,description,creator_user_id,assignee_user_id,status,priority,progress,due_at,project_id,received_at,created_at,last_activity_at,projects(id,project_no,name_ar)')
          .order('last_activity_at',{ascending:false})
          .limit(100),
        supabase.from('notifications').select('id,title,body,link,severity,is_read,created_at').order('created_at',{ascending:false}).limit(30),
        supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key'),
        supabase.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
      ]);
      if (!alive) return;
      const errors=[tasksQ.error,notificationsQ.error,capsQ.error,projectsQ.error].filter(Boolean);
      if(errors.length) setErr('تعذر تحميل بعض عناصر صفحة اليوم. المعروض أدناه يقتصر على البيانات المتاحة لحسابك.');
      setState({
        uid,
        employee:userQ.data?.employees || null,
        tasks:tasksQ.data || [],
        notifications:notificationsQ.data || [],
        capabilities:capsQ.data || [],
        projects:projectsQ.data || [],
      });
    })();
    return () => { alive=false; };
  }, []);

  const view = useMemo(() => {
    if (!state) return null;
    const today = dateKey();
    const tasks = state.tasks || [];
    const active = tasks.filter((task)=>!CLOSED.has(task.status));
    const mine = tasks.filter((task)=>task.assignee_user_id===state.uid);
    const sent = tasks.filter((task)=>task.creator_user_id===state.uid);
    const overdue = active.filter((task)=>task.due_at && dateKey(task.due_at)<today);
    const dueToday = active.filter((task)=>task.due_at && dateKey(task.due_at)===today);
    const inbox = mine.filter((task)=>task.task_type==='request' && !CLOSED.has(task.status));
    const myTasks = mine.filter((task)=>task.task_type!=='request' && !CLOSED.has(task.status));
    const followup = tasks.filter((task)=>!CLOSED.has(task.status) && (task.status==='waiting' || (task.creator_user_id===state.uid && task.assignee_user_id!==state.uid)));
    const completed = tasks.filter((task)=>CLOSED.has(task.status));
    const todayRows = [...new Map([
      ...overdue,
      ...dueToday,
      ...inbox.filter((task)=>task.status==='new' || task.status==='received'),
      ...myTasks.filter((task)=>task.status==='in_progress' || task.status==='waiting'),
    ].map((task)=>[task.id,task])).values()];

    const projectCaps = state.capabilities.filter((cap)=>cap.module_key==='projects');
    const projectsScreen = projectCaps.some((cap)=>cap.scope_type==='all');
    const projectRows = state.projects.map((project)=>{
      const caps=projectCaps.filter((cap)=>cap.scope_type==='all' || (cap.scope_type==='project' && cap.scope_key===project.id));
      const keys=new Set(caps.map((cap)=>cap.capability_key));
      const projectFull = projectsScreen || keys.has('projects.overview.view') || keys.has('projects.projects.view');
      return {
        ...project,
        projectFull,
        attendance:keys.has('projects.timesheets.view'),
        expenses:keys.has('projects.expenses.view'),
      };
    });

    return {
      today,
      overdue,
      dueToday,
      inbox,
      myTasks,
      sent,
      followup,
      completed,
      todayRows,
      unread:(state.notifications||[]).filter((n)=>!n.is_read),
      projectsScreen,
      projectRows,
    };
  }, [state]);

  if (!state || !view) return <ConstitutionPage><EmptyState title="جارٍ تجهيز يومك" description="يتم جمع المهام والمراسلات والتنبيهات والنطاقات المسموحة لهذا الحساب."/></ConstitutionPage>;

  const rows = ({today:view.todayRows,inbox:view.inbox,tasks:view.myTasks,sent:view.sent,followup:view.followup,completed:view.completed})[tab] || [];
  const empName=state.employee?.full_name_ar || 'المستخدم';

  return <ConstitutionPage>
    <PageHeader eyebrow="TODAY" title={`اليوم — ${empName}`} description="مركزك الشخصي: ما يحتاج انتباهك الآن فقط، ضمن الصلاحيات الممنوحة لك."/>
    {err&&<Notice tone="warning">{err}</Notice>}

    <Section title="ما يحتاج انتباهك الآن">
      <div className="grid k4">
        <div className="card"><h3>وارد جديد</h3><div className="big">{view.inbox.filter((t)=>['new','received'].includes(t.status)).length}</div><div className="foot">طلبات ومراسلات بانتظارك</div></div>
        <div className="card"><h3>متأخر</h3><div className="big">{view.overdue.length}</div><div className="foot">تجاوز موعده ولم يُغلق</div></div>
        <div className="card"><h3>موعد اليوم</h3><div className="big">{view.dueToday.length}</div><div className="foot">مهام مرتبطة بتاريخ اليوم</div></div>
        <div className="card"><h3>تنبيهات جديدة</h3><div className="big">{view.unread.length}</div><div className="foot">تنبيهات شخصية غير مقروءة</div></div>
      </div>
    </Section>

    <Section title="مساحتي في النظام" description="الاختصارات هنا ناتجة عن صلاحياتك؛ صفحة اليوم لا تمنح صلاحية إضافية.">
      {view.projectsScreen && <div className="msg ok" style={{marginBottom:12}}>
        لديك كامل صلاحية شاشة المشاريع. <Link href="/dashboard/projects"><strong>فتح شاشة المشاريع ←</strong></Link>
      </div>}
      {view.projectRows.length===0 ? <EmptyState title="لا توجد مشاريع ضمن نطاقك" description="ستظهر هنا المشاريع أو أدوات الموقع فور إسناد صلاحية لك."/> :
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
          {view.projectRows.map((project)=><div key={project.id} className="section" style={{margin:0,padding:16}}>
            <div style={{fontSize:12,opacity:.7}}>{project.project_no||'—'}</div>
            <h3 style={{margin:'5px 0 4px'}}>{project.name_ar}</h3>
            <div className="hint">{project.city||'الموقع غير محدد'}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:14}}>
              {project.projectFull && <Link className="btn" href={`/dashboard/projects/${project.id}`}>فتح المشروع</Link>}
              {!project.projectFull && project.attendance && <Link className="btn" href={`/dashboard/projects/${project.id}/operations`}>الحضور</Link>}
              {!project.projectFull && project.expenses && <Link className="btn ghost" href={`/dashboard/projects/${project.id}/operations/expenses`}>المصروفات</Link>}
            </div>
          </div>)}
        </div>}
    </Section>

    <Section title="المهام والمراسلات">
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
        {TABS.map(([key,label])=>{
          const count=({today:view.todayRows,inbox:view.inbox,tasks:view.myTasks,sent:view.sent,followup:view.followup,completed:view.completed})[key]?.length||0;
          return <button key={key} className={`btn ${tab===key?'':'ghost'}`} onClick={()=>setTab(key)}>{label} ({count})</button>;
        })}
      </div>
      {rows.length===0 ? <EmptyState title="لا توجد عناصر هنا" description="لا توجد مهام أو مراسلات مطابقة لهذا التبويب ضمن صلاحياتك الحالية."/> :
        <div style={{display:'grid',gap:8}}>
          {rows.map((task)=><div key={task.id} style={{border:'1px solid var(--hair)',borderRadius:10,padding:'12px 14px'}}>
            <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <strong>{task.title}</strong>
                {task.description&&<div className="hint" style={{marginTop:4}}>{task.description}</div>}
              </div>
              <span>{STATUS_AR[task.status]||task.status}</span>
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:9,fontSize:12,opacity:.75}}>
              <span>{task.task_type==='request'?'مراسلة / طلب':'مهمة'}</span>
              <span>الأولوية: {PRIORITY_AR[task.priority]||task.priority||'—'}</span>
              {taskProject(task)&&<span>المشروع: {taskProject(task)}</span>}
              {task.due_at&&<span>الموعد: {dateKey(task.due_at)}</span>}
              {typeof task.progress==='number'&&<span>الإنجاز: {task.progress}%</span>}
            </div>
          </div>)}
        </div>}
    </Section>

    <Section title="التنبيهات الشخصية">
      {state.notifications.length===0?<EmptyState title="لا توجد تنبيهات" description="ستظهر هنا التنبيهات التي تخص حسابك فقط."/>:
        <div style={{display:'grid',gap:8}}>{state.notifications.slice(0,10).map((item)=><div key={item.id} style={{border:'1px solid var(--hair)',borderRadius:10,padding:'11px 13px',opacity:item.is_read?.7:1}}>
          <strong>{item.title}</strong>{item.body&&<div className="hint">{item.body}</div>}{item.link&&<Link href={item.link} style={{display:'inline-block',marginTop:5}}>فتح ←</Link>}
        </div>)}</div>}
    </Section>
  </ConstitutionPage>;
}
