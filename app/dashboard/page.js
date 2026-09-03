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
  WorkFormGrid,
  WorkField,
  ActionDock,
  StatusChip,
  StatusDot,
  RecordList,
  RecordRow,
  RecordSummary,
} from '@/components/ui/ConstitutionUI';

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

function priorityTone(priority) {
  if (priority === 'urgent') return 'danger';
  if (priority === 'high') return 'warning';
  return 'neutral';
}

function statusTone(status) {
  if (status === 'waiting') return 'warning';
  if (status === 'in_progress') return 'info';
  if (status === 'new' || status === 'received') return 'info';
  return 'neutral';
}

function TaskRows({ rows = [], empty = 'لا يوجد شيء يحتاجك هنا الآن.' }) {
  if (!rows.length) return <div data-work-empty-inline="true">{empty}</div>;
  return <RecordList label="الأعمال الحالية">
    {rows.map((task) => <RecordRow key={task.id} href={taskHref(task)} ariaLabel={task.title || 'فتح العمل'}>
      <div data-work-attention-record="true">
        <StatusDot tone={priorityTone(task.priority)} />
        <RecordSummary
          title={task.title || 'عمل بلا عنوان'}
          note={task.description || task.source_label || 'تواصل عمل'}
          meta={[
            STATUS_AR[task.status] || task.status || '—',
            task.projects?.name_ar || null,
          ]}
          metrics={task.due_at ? [{ key:'due', label:'الموعد', value:dateAr(task.due_at) }] : []}
        />
        <StatusChip tone={priorityTone(task.priority)}>{PRIORITY_AR[task.priority] || task.priority || 'عادي'}</StatusChip>
      </div>
    </RecordRow>)}
  </RecordList>;
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
    if (errors.length) setError('تعذر تحميل بعض أجزاء لوحة المتابعة، بينما بقيت الأجزاء المتاحة تعمل.');
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
      data-idle-work-surface="true"
      data-work-center-visibility="idle-only"
      data-employee-desktop="true"
      data-work-center="attention-dashboard"
    >
      <PageHeader
        title="مركز العمل"
        description="ما يحتاج انتباهك اليوم من أعمال وقرارات وتنبيهات؛ التاريخ الكامل يبقى في أدواته الأصلية."
      />

      {error ? <Notice tone="warning">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <SummaryStrip
        label="مؤشرات مختصرة"
        items={[
          { key:'attention', label:'يحتاجك الآن', value:desktop.attention.length, note:'الأقرب للحركة' },
          { key:'personal', label:'مهام شخصية', value:desktop.personal.length, note:'نشطة في مكتبك' },
          { key:'inbox', label:'الوارد إليك', value:desktop.incoming.length, note:'من الآخرين' },
          { key:'approvals', label:'بانتظار قرارك', value:desktop.approvals.length, note:'معاملات اعتماد' },
        ]}
      />

      <Section title="مهمة شخصية سريعة" description="دوّن ما تريد متابعته دون مغادرة لوحة المتابعة." boundary>
        <form onSubmit={createPersonalTask} data-work-quick-task="true">
          <WorkFormGrid columns={12} label="إضافة مهمة شخصية">
            <WorkField label="المهمة" span={8}>
              <input value={taskTitle} onChange={(event)=>setTaskTitle(event.target.value)} placeholder="مثال: متابعة خطاب العميل" maxLength={240}/>
            </WorkField>
            <WorkField label="الموعد" span={4}>
              <input type="date" value={taskDue} onChange={(event)=>setTaskDue(event.target.value)}/>
            </WorkField>
          </WorkFormGrid>
          <ActionDock>
            <button type="submit" className="btn" disabled={busy || !taskTitle.trim()}>{busy ? 'جارٍ الإضافة…' : 'إضافة إلى مكتبي'}</button>
          </ActionDock>
        </form>
      </Section>

      {state.loading ? <EmptyState title="جارٍ تجهيز لوحة المتابعة" description="يتم جمع ما يخصك من مصادر البرنامج الحالية."/> : <div data-work-center-layout="attention">
        <div data-work-center-column="primary">
          <Section
            title="أعمال تحتاج قرارك اليوم"
            description="الأقرب للتأخر أو ما وصل إليك ويحتاج حركة."
            actions={<Link data-work-section-link="true" href="/dashboard/my-work">فتح أعمالي</Link>}
          >
            <TaskRows rows={desktop.attention} />
          </Section>

          <Section
            title="الوارد والمراسلات"
            description="الأعمال والطلبات التي أرسلها الآخرون إليك."
            actions={<Link data-work-section-link="true" href="/dashboard/my-work">كل الوارد</Link>}
          >
            <TaskRows rows={desktop.incoming} empty="لا توجد مراسلات أو أعمال واردة نشطة."/>
          </Section>

          <Section
            title="مهامي الشخصية"
            description="المهام النشطة التي أنشأتها لنفسك."
            actions={<Link data-work-section-link="true" href="/dashboard/my-work">كل المهام</Link>}
          >
            <TaskRows rows={desktop.personal} empty="لا توجد مهام شخصية نشطة."/>
          </Section>
        </div>

        <div data-work-center-column="side">
          <Section
            title="بانتظار قراري"
            description="معاملات وصلت إلى مرحلة تحتاج قرارك."
            actions={<Link data-work-section-link="true" href="/dashboard/approvals">كل الاعتمادات</Link>}
          >
            {desktop.approvals.length ? <RecordList label="الاعتمادات بانتظار القرار">{desktop.approvals.map((row) => <RecordRow href="/dashboard/approvals" key={row.workflow_id}>
              <RecordSummary
                title={row.source_label || row.label_ar || 'معاملة اعتماد'}
                meta={[row.origin_group_label || '—', row.target_group_label || '—']}
                metrics={[{ key:'workflow', label:'المعاملة', value:row.workflow_no || '—' }]}
              />
            </RecordRow>)}</RecordList> : <div data-work-empty-inline="true">لا توجد معاملات بانتظار قرارك.</div>}
          </Section>

          <Section title="التنبيهات" description="الجديد غير المقروء فقط؛ لا نعيد عرض التاريخ هنا.">
            {desktop.notifications.length ? <RecordList label="التنبيهات الجديدة">{desktop.notifications.map((notice) => <RecordRow key={notice.id} href={notice.link || undefined}>
              <RecordSummary
                title={notice.title || 'تنبيه'}
                note={notice.body || null}
                badge={notice.severity && notice.severity !== 'info' ? notice.severity : null}
              />
            </RecordRow>)}</RecordList> : <div data-work-empty-inline="true">لا توجد تنبيهات جديدة.</div>}
          </Section>

          <div data-work-status-line="true">
            <span>{desktop.activeCount} عمل نشط متاح لك</span>
            <span>·</span>
            <span>تعرض اللوحة الحاضر فقط</span>
          </div>
        </div>
      </div>}
    </div>
  </ConstitutionPage>;
}
