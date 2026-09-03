'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  ConstitutionPage,
  PageHeader,
  SummaryStrip,
  Section,
  Notice,
  EmptyState,
} from '@/components/ui/ConstitutionUI';
import styles from './work-center.module.css';

const CLOSED = new Set(['completed','closed','cancelled']);
const PRIORITY_AR = { normal:'عادي', high:'مرتفع', urgent:'عاجل' };
const STATUS_AR = { new:'جديد', received:'مستلم', in_progress:'قيد الإنجاز', waiting:'بانتظار إجراء' };

function riyadhDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Riyadh',
  }).format(value instanceof Date ? value : new Date(value));
}

function dateAr(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year:'numeric', month:'short', day:'numeric', timeZone:'Asia/Riyadh',
  }).format(new Date(value));
}

function taskHref(task) {
  return task?.source_route || '/dashboard/my-work';
}

function TaskRows({ rows = [], empty = 'لا يوجد شيء يحتاجك هنا الآن.' }) {
  if (!rows.length) return <div className={styles.empty}>{empty}</div>;
  return <div className={styles.list}>
    {rows.map((task) => <Link key={task.id} href={taskHref(task)} className={styles.item}>
      <div className={styles.itemCopy}>
        <strong>{task.title || 'عمل بلا عنوان'}</strong>
        <span>{task.description || task.source_label || 'تواصل عمل'}</span>
        <small>{STATUS_AR[task.status] || task.status || '—'}{task.projects?.name_ar ? ` · ${task.projects.name_ar}` : ''}</small>
      </div>
      <div className={styles.itemMeta}>
        {task.due_at ? <span>{dateAr(task.due_at)}</span> : null}
        <span className={task.priority === 'urgent' ? styles.priorityUrgent : task.priority === 'high' ? styles.priorityHigh : ''}>
          {PRIORITY_AR[task.priority] || task.priority || 'عادي'}
        </span>
      </div>
    </Link>)}
  </div>;
}

export default function Dashboard() {
  const me = useDashboardSession();
  const [state, setState] = useState({ loading:true, tasks:[], approvals:[], notifications:[] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me?.userId) return;
    setError('');
    const approvalsPromise = me?.access?.approvals
      ? supabase.rpc('fn_my_approval_inbox')
      : Promise.resolve({ data:[], error:null });
    const [tasksQ, notificationsQ, approvalsQ] = await Promise.all([
      supabase
        .from('workspace_tasks')
        .select('id,task_type,title,description,creator_user_id,assignee_user_id,status,priority,due_at,project_id,created_at,last_activity_at,work_source,source_route,source_label,projects(id,project_no,name_ar)')
        .order('last_activity_at', { ascending:false })
        .limit(160),
      supabase
        .from('notifications')
        .select('id,title,body,link,severity,is_read,created_at')
        .eq('is_read', false)
        .order('created_at', { ascending:false })
        .limit(30),
      approvalsPromise,
    ]);

    const errors = [tasksQ.error, notificationsQ.error, approvalsQ.error].filter(Boolean);
    if (errors.length) setError('تعذر تحميل بعض أجزاء سطح المكتب، بينما بقيت الأجزاء المتاحة تعمل.');
    setState({
      loading:false,
      tasks:tasksQ.data || [],
      approvals:approvalsQ.data || [],
      notifications:notificationsQ.data || [],
    });
  }, [me?.access?.approvals, me?.userId]);

  useEffect(() => { load(); }, [load]);

  const desktop = useMemo(() => {
    const uid = me?.userId;
    const active = state.tasks.filter((task) => !CLOSED.has(task.status));
    const today = riyadhDay();
    const personal = active.filter((task) => task.task_type === 'personal_task' && task.creator_user_id === uid);
    const incoming = active.filter((task) => task.assignee_user_id === uid && task.creator_user_id !== uid);
    const overdue = active.filter((task) => task.due_at && riyadhDay(task.due_at) < today);
    const dueToday = active.filter((task) => task.due_at && riyadhDay(task.due_at) === today);
    const attention = [...new Map([
      ...overdue,
      ...dueToday,
      ...incoming.filter((task) => ['new','received','waiting'].includes(task.status)),
      ...personal.filter((task) => ['in_progress','waiting'].includes(task.status)),
    ].map((task) => [task.id, task])).values()].slice(0, 7);
    return {
      personal:personal.slice(0, 6),
      incoming:incoming.slice(0, 6),
      attention,
      approvals:state.approvals.slice(0, 6),
      notifications:state.notifications.slice(0, 6),
      activeCount:active.length,
    };
  }, [me?.userId, state]);

  async function createPersonalTask(event) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title || busy) return;
    setBusy(true); setError(''); setMessage('');
    const due = taskDue ? new Date(`${taskDue}T12:00:00+03:00`).toISOString() : null;
    const { error:rpcError } = await supabase.rpc('fn_create_workspace_task', {
      p_task_type:'personal_task',
      p_title:title,
      p_description:null,
      p_assignee_user_id:null,
      p_priority:'normal',
      p_due_at:due,
      p_project_id:null,
      p_collaborator_ids:[],
      p_follower_ids:[],
    });
    if (rpcError) setError(rpcError.message || 'تعذر إنشاء المهمة.');
    else {
      setTaskTitle(''); setTaskDue(''); setMessage('أضيفت المهمة إلى مكتبك.');
      await load();
    }
    setBusy(false);
  }

  return <ConstitutionPage>
    <div
      className={styles.desktop}
      data-idle-work-surface="true"
      data-work-center-visibility="idle-only"
      data-employee-desktop="true"
    >
      <PageHeader
        eyebrow="WORK CENTER"
        title="مركز العمل"
        description="سطح مكتبك اليومي: ما يحتاجك الآن، مهامك، مراسلاتك، قراراتك وتنبيهاتك. التاريخ الكامل يبقى في أدواته الأصلية."
      />

      {error ? <Notice tone="warning">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <SummaryStrip
        label="حالة مكتب الموظف"
        items={[
          { key:'attention', label:'يحتاجك الآن', value:desktop.attention.length },
          { key:'personal', label:'مهام شخصية', value:desktop.personal.length },
          { key:'inbox', label:'الوارد إليك', value:desktop.incoming.length },
          { key:'approvals', label:'بانتظار قرارك', value:desktop.approvals.length },
        ]}
      />

      <Section title="مهمة شخصية سريعة" description="دوّن ما تريد تذكره أو إنجازه دون مغادرة مكتبك." boundary>
        <form className={styles.quickTask} onSubmit={createPersonalTask}>
          <label>
            <span>المهمة</span>
            <input value={taskTitle} onChange={(event)=>setTaskTitle(event.target.value)} placeholder="مثال: متابعة خطاب العميل" maxLength={240}/>
          </label>
          <label>
            <span>موعد اختياري</span>
            <input type="date" value={taskDue} onChange={(event)=>setTaskDue(event.target.value)}/>
          </label>
          <button type="submit" className="btn" disabled={busy || !taskTitle.trim()}>{busy ? 'جارٍ الإضافة…' : 'إضافة إلى مكتبي'}</button>
        </form>
      </Section>

      {state.loading ? <EmptyState title="جارٍ تجهيز مكتبك" description="يتم جمع ما يخصك من مصادر البرنامج الحالية."/> : <div className={styles.desktopGrid}>
        <div className={styles.primaryColumn}>
          <Section
            title="يحتاجك الآن"
            description="الأقرب للتأخر أو ما وصل إليك ويحتاج حركة."
            actions={<Link className={styles.sectionLink} href="/dashboard/my-work">فتح أعمالي</Link>}
          >
            <TaskRows rows={desktop.attention} />
          </Section>

          <Section
            title="الوارد والمراسلات"
            description="الأعمال والطلبات التي أرسلها الآخرون إليك."
            actions={<Link className={styles.sectionLink} href="/dashboard/my-work">كل الوارد</Link>}
          >
            <TaskRows rows={desktop.incoming} empty="لا توجد مراسلات أو أعمال واردة نشطة."/>
          </Section>

          <Section
            title="مهامي الشخصية"
            description="المهام النشطة التي أنشأتها لنفسك."
            actions={<Link className={styles.sectionLink} href="/dashboard/my-work">كل المهام</Link>}
          >
            <TaskRows rows={desktop.personal} empty="لا توجد مهام شخصية نشطة."/>
          </Section>
        </div>

        <div className={styles.sideColumn}>
          <Section
            title="بانتظار قراري"
            description="معاملات وصلت إلى مرحلة تحتاج قرارك."
            actions={<Link className={styles.sectionLink} href="/dashboard/approvals">كل الاعتمادات</Link>}
          >
            {desktop.approvals.length ? <div className={styles.list}>{desktop.approvals.map((row) => <Link href="/dashboard/approvals" className={styles.item} key={row.workflow_id}>
              <div className={styles.itemCopy}>
                <strong>{row.source_label || row.label_ar || 'معاملة اعتماد'}</strong>
                <span>{row.origin_group_label || '—'} · {row.target_group_label || '—'}</span>
              </div>
              <div className={styles.itemMeta}><span>{row.workflow_no || '—'}</span></div>
            </Link>)}</div> : <div className={styles.empty}>لا توجد معاملات بانتظار قرارك.</div>}
          </Section>

          <Section title="التنبيهات" description="الجديد غير المقروء فقط؛ لا نعيد عرض التاريخ هنا.">
            {desktop.notifications.length ? <div className={styles.list}>{desktop.notifications.map((notice) => {
              const content = <><strong>{notice.title || 'تنبيه'}</strong>{notice.body ? <span>{notice.body}</span> : null}</>;
              return notice.link
                ? <Link key={notice.id} href={notice.link} className={styles.noticeItem}>{content}</Link>
                : <div key={notice.id} className={styles.noticeItem}>{content}</div>;
            })}</div> : <div className={styles.empty}>لا توجد تنبيهات جديدة.</div>}
          </Section>

          <div className={styles.statusLine}>
            <span>{desktop.activeCount} عمل نشط متاح لك</span>
            <span>·</span>
            <span>المكتب يعرض الحاضر فقط</span>
          </div>
        </div>
      </div>}
    </div>
  </ConstitutionPage>;
}
