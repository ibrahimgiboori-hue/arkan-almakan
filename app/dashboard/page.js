'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, daysUntil } from '@/lib/format';
import styles from './dashboard-redesign.module.css';

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function expiryStatus(days) {
  if (days < 0) return { label: `منتهية منذ ${Math.abs(days)} يوم`, tone: 'danger' };
  if (days <= 30) return { label: `${days} يوم`, tone: 'danger' };
  if (days <= 60) return { label: `${days} يوم`, tone: 'warning' };
  return { label: `${days} يوم`, tone: 'info' };
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [employeesResult, documentsResult, projectsResult, financialsResult] = await Promise.all([
        supabase
          .from('employees')
          .select('id, employee_no, full_name_ar, job_title, status, id_expiry, basic_salary, housing_allowance, transport_allowance, other_allowance')
          .order('employee_no'),
        supabase.from('documents').select('id', { count: 'exact', head: true }),
        supabase
          .from('projects')
          .select('id, project_no, name_ar, city, stage, status, contract_value')
          .order('project_no'),
        supabase
          .from('v_project_financials')
          .select('project_id, current_profit, pending_collection, items_without_decision, computed_progress_pct'),
      ]);

      if (!alive) return;

      const errors = [
        employeesResult.error,
        documentsResult.error,
        projectsResult.error,
        financialsResult.error,
      ].filter(Boolean);
      if (errors.length) setError('تعذر تحميل بعض مؤشرات مركز القيادة. البيانات المتاحة أدناه ما زالت صالحة للعرض.');

      const employees = employeesResult.data || [];
      const activeEmployees = employees.filter((employee) => employee.status === 'active');
      const expiring = employees
        .map((employee) => ({ ...employee, remainingDays: employee.id_expiry ? daysUntil(employee.id_expiry) : null }))
        .filter((employee) => employee.remainingDays !== null && employee.remainingDays <= 90)
        .sort((a, b) => a.remainingDays - b.remainingDays);

      const projects = projectsResult.data || [];
      const executionProjects = projects.filter((project) => project.stage === 'execution' && project.status !== 'archived');
      const financialMap = {};
      (financialsResult.data || []).forEach((row) => { financialMap[row.project_id] = row; });

      const payroll = activeEmployees.reduce((total, employee) =>
        total + Number(employee.basic_salary || 0)
          + Number(employee.housing_allowance || 0)
          + Number(employee.transport_allowance || 0)
          + Number(employee.other_allowance || 0), 0);

      setData({
        activeEmployees,
        expiring,
        projects,
        executionProjects,
        financialMap,
        payroll,
        documentCount: documentsResult.count || 0,
      });
    })();
    return () => { alive = false; };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;

    const { executionProjects, financialMap, expiring } = data;
    const projectRows = executionProjects.map((project) => ({
      ...project,
      financial: financialMap[project.id] || {},
    }));

    const decisionProjects = projectRows
      .filter((project) => Number(project.financial.items_without_decision || 0) > 0)
      .sort((a, b) => Number(b.financial.items_without_decision || 0) - Number(a.financial.items_without_decision || 0));

    const collectionProjects = projectRows
      .filter((project) => Number(project.financial.pending_collection || 0) > 0)
      .sort((a, b) => Number(b.financial.pending_collection || 0) - Number(a.financial.pending_collection || 0));

    const noDecisionTotal = decisionProjects.reduce((total, project) =>
      total + Number(project.financial.items_without_decision || 0), 0);
    const pendingCollectionTotal = collectionProjects.reduce((total, project) =>
      total + Number(project.financial.pending_collection || 0), 0);

    const progressValues = projectRows
      .map((project) => Number(project.financial.computed_progress_pct || 0))
      .filter((value) => Number.isFinite(value));
    const averageProgress = progressValues.length
      ? progressValues.reduce((total, value) => total + value, 0) / progressValues.length
      : 0;

    let focus;
    if (decisionProjects.length) {
      const project = decisionProjects[0];
      const count = Number(project.financial.items_without_decision || 0);
      focus = {
        eyebrow: 'الأعلى أثرًا الآن',
        title: `${project.name_ar} لديه ${count} ${count === 1 ? 'بند' : 'بنود'} بلا قرار تنفيذ.`,
        description: 'هذه البنود لا تبدأ دورة التنفيذ قبل تسجيل القرار، لذلك تظهر في مقدمة مركز القيادة.',
        value: `${count}`,
        valueLabel: 'بند يحتاج قرارًا',
        sub: project.project_no || 'مشروع قيد التنفيذ',
        href: `/dashboard/projects/${project.id}`,
        action: 'فتح المشروع',
      };
    } else if (expiring.length) {
      const employee = expiring[0];
      const status = expiryStatus(employee.remainingDays);
      focus = {
        eyebrow: 'الأقرب زمنيًا',
        title: `${employee.full_name_ar} — الهوية أو الإقامة تحتاج متابعة.`,
        description: 'مركز القيادة يرفع التنبيهات الأقرب للانتهاء حتى لا تضيع داخل قائمة الموظفين.',
        value: status.label,
        valueLabel: 'المتبقي حتى الانتهاء',
        sub: employee.job_title || employee.employee_no || 'القوى العاملة',
        href: `/dashboard/employees/${employee.id}`,
        action: 'فتح الموظف',
      };
    } else if (collectionProjects.length) {
      const project = collectionProjects[0];
      focus = {
        eyebrow: 'متابعة مالية',
        title: `مستحقات ${project.name_ar} تحتاج متابعة تحصيل.`,
        description: 'لا توجد قرارات تنفيذ متأخرة الآن، لذلك تنتقل الأولوية إلى المستحقات المفتوحة للمشاريع.',
        value: money(project.financial.pending_collection || 0),
        valueLabel: 'مستحق ولم يُحصّل',
        sub: project.project_no || 'مشروع قيد التنفيذ',
        href: `/dashboard/projects/${project.id}`,
        action: 'فتح المشروع',
      };
    } else {
      focus = {
        eyebrow: 'الوضع الحالي',
        title: 'لا توجد قرارات تشغيلية حرجة مسجلة الآن.',
        description: 'سيظهر هنا تلقائيًا أول بند يحتاج قرارًا أو متابعة فور وصوله إلى النظام.',
        value: '0',
        valueLabel: 'بنود حرجة',
        sub: 'مركز القيادة محدث',
        href: '/dashboard/projects',
        action: 'فتح المشاريع',
      };
    }

    const queue = [
      ...decisionProjects.slice(0, 4).map((project) => {
        const count = Number(project.financial.items_without_decision || 0);
        return {
          weight: 1,
          title: `${count} ${count === 1 ? 'بند' : 'بنود'} بلا قرار تنفيذ`,
          description: 'يتطلب تسجيل قرار قبل بدء التنفيذ.',
          scope: project.name_ar,
          status: 'قرار مطلوب',
          tone: 'danger',
          owner: 'إدارة المشروع',
          href: `/dashboard/projects/${project.id}`,
        };
      }),
      ...expiring.slice(0, 4).map((employee) => {
        const status = expiryStatus(employee.remainingDays);
        return {
          weight: employee.remainingDays <= 30 ? 2 : 3,
          title: `انتهاء هوية / إقامة — ${employee.full_name_ar}`,
          description: employee.job_title || employee.employee_no || 'موظف',
          scope: 'القوى العاملة',
          status: status.label,
          tone: status.tone,
          owner: 'الموارد البشرية',
          href: `/dashboard/employees/${employee.id}`,
        };
      }),
      ...collectionProjects.slice(0, 3).map((project) => ({
        weight: 4,
        title: `مستحقات تحتاج متابعة تحصيل`,
        description: `${money(project.financial.pending_collection || 0)} ر.س مسجلة كمستحق غير محصل.`,
        scope: project.name_ar,
        status: 'تحصيل',
        tone: 'info',
        owner: 'المالية',
        href: `/dashboard/projects/${project.id}`,
      })),
    ].sort((a, b) => a.weight - b.weight).slice(0, 8);

    return {
      projectRows,
      decisionProjects,
      collectionProjects,
      noDecisionTotal,
      pendingCollectionTotal,
      averageProgress,
      focus,
      queue,
    };
  }, [data]);

  if (!data || !view) return (
    <div className={styles.loadingScreen} style={{minHeight:'calc(100vh - 104px)'}}>
      <div className={styles.loadingBox}>
        <div className={styles.loadingBar} />
        <div className={styles.loadingBar} />
      </div>
    </div>
  );

  const toneClass = (tone) => ({
    danger: styles.statusDanger,
    warning: styles.statusWarning,
    info: styles.statusInfo,
    good: styles.statusGood,
  }[tone] || styles.statusInfo);

  return (
    <div className={styles.commandCenter}>
      <main className={styles.mainFlow}>
        {error && <div className="msg err" style={{marginBottom:14}}>{error}</div>}

        <div className={styles.intro}>
          <div>
            <div className={styles.eyebrow}>ARKAN / COMMAND</div>
            <h1>كل ما يحتاج قرارًا، في مسار واحد.</h1>
          </div>
          <p className={styles.introNote}>تُرفع الأولوية حسب أثر القرار، قرب الموعد، وحالة المشروع — بدون إغراق الشاشة ببطاقات منفصلة.</p>
        </div>

        <div className={styles.signalStrip}>
          <div className={styles.signal}>
            <span className={styles.signalValue}>{data.executionProjects.length}</span>
            <span className={styles.signalLabel}>مشاريع قيد التنفيذ</span>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalValue}>{data.activeEmployees.length}</span>
            <span className={styles.signalLabel}>موظفون على رأس العمل</span>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalValue}>{view.noDecisionTotal}</span>
            <span className={styles.signalLabel}>بنود بلا قرار تنفيذ</span>
          </div>
          <div className={styles.signal}>
            <span className={styles.signalValue}>{data.expiring.length}</span>
            <span className={styles.signalLabel}>هويات / إقامات خلال 90 يومًا</span>
          </div>
        </div>

        <section className={styles.focusCard}>
          <div className={styles.focusCopy}>
            <div className={styles.eyebrow}>{view.focus.eyebrow}</div>
            <h2 className={styles.focusTitle}>{view.focus.title}</h2>
            <p className={styles.focusDescription}>{view.focus.description}</p>
          </div>
          <div className={styles.focusMeta}>
            <div className={styles.focusMetaLabel}>{view.focus.valueLabel}</div>
            <strong className={styles.focusMetaValue}>{view.focus.value}</strong>
            <div className={styles.focusMetaSub}>{view.focus.sub}</div>
            <Link href={view.focus.href} className={styles.focusLink}>{view.focus.action} ←</Link>
          </div>
        </section>

        <div className={styles.sectionLine}>
          <h2>مسار القرار والمتابعة</h2>
          <div className={styles.filters}>
            <span className={styles.filterChip}>المصدر: بيانات النظام</span>
            <span className={styles.filterChip}>الترتيب: الأولوية</span>
          </div>
        </div>

        <div className={styles.queue}>
          <div className={`${styles.queueRow} ${styles.queueHead}`}>
            <div>#</div><div>البند</div><div>النطاق</div><div>الحالة</div><div className={styles.queueOwner}>المسؤول</div><div></div>
          </div>
          {view.queue.length === 0 ? (
            <div className={styles.emptyQueue}>
              <strong>لا توجد بنود مفتوحة في مركز القيادة.</strong>
              ستظهر هنا تلقائيًا البنود التي تحتاج قرارًا أو متابعة.
            </div>
          ) : view.queue.map((item, index) => (
            <div className={styles.queueRow} key={`${item.href}-${item.title}-${index}`}>
              <div className={styles.rank}>{String(index + 1).padStart(2, '0')}</div>
              <div className={styles.queueTitle}>
                <Link href={item.href} className={styles.queueLink}><strong>{item.title}</strong></Link>
                <span>{item.description}</span>
              </div>
              <div>{item.scope}</div>
              <div className={`${styles.statusText} ${toneClass(item.tone)}`}>{item.status}</div>
              <div className={styles.queueOwner}>{item.owner}</div>
              <Link href={item.href} className={styles.moreAction} aria-label={`فتح ${item.title}`}>←</Link>
            </div>
          ))}
        </div>
      </main>

      <aside className={styles.inspector}>
        <div className={styles.inspectorHeader}>
          <div>
            <div className={styles.eyebrow}>PROJECT PULSE</div>
            <h3>نبض المشاريع</h3>
          </div>
          <strong className={styles.inspectorValue}>{Math.round(view.averageProgress)}%</strong>
        </div>

        <div className={styles.projectPulse}>
          {view.projectRows.length === 0 ? (
            <div className={styles.emptyQueue}><strong>لا مشاريع في مرحلة التنفيذ.</strong></div>
          ) : view.projectRows.slice(0, 4).map((project) => {
            const progress = clampProgress(project.financial.computed_progress_pct);
            const decisions = Number(project.financial.items_without_decision || 0);
            const pending = Number(project.financial.pending_collection || 0);
            const badgeClass = decisions > 0 ? styles.badgeDanger : pending > 0 ? styles.badgeWarning : styles.badgeGood;
            const badgeText = decisions > 0 ? 'يحتاج قرار' : pending > 0 ? 'متابعة مالية' : 'مستقر';
            return (
              <div className={styles.projectPulseItem} key={project.id}>
                <div className={styles.projectPulseTop}>
                  <Link href={`/dashboard/projects/${project.id}`} className={styles.projectPulseName}>{project.name_ar}</Link>
                  <span className={`${styles.badge} ${badgeClass}`}>{badgeText}</span>
                </div>
                <div className={styles.progressTrack}><span style={{width:`${progress}%`}} /></div>
                <div className={styles.projectPulseMeta}>
                  <span>{Math.round(progress)}% إنجاز</span>
                  <span>{project.project_no || '—'}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.inspectorSectionTitle}>الأقرب للانتهاء</div>
        {data.expiring.length === 0 ? (
          <div className={styles.emptyQueue}><strong>لا تنبيهات خلال 90 يومًا.</strong></div>
        ) : data.expiring.slice(0, 5).map((employee) => (
          <Link className={styles.alertItem} key={employee.id} href={`/dashboard/employees/${employee.id}`}>
            <span className={styles.alertDot} />
            <span><strong>{employee.full_name_ar}</strong><span>{employee.job_title || employee.employee_no || 'موظف'}</span></span>
            <span className={styles.alertDays}>{expiryStatus(employee.remainingDays).label}</span>
          </Link>
        ))}
        <Link className={styles.inspectorLink} href="/dashboard/employees">فتح القوى العاملة ←</Link>

        <div className={styles.inspectorSectionTitle}>صورة مالية مختصرة</div>
        <div className={styles.alertItem}>
          <span className={styles.alertDot} />
          <span><strong>مستحق ولم يُحصّل</strong><span>المشاريع قيد التنفيذ</span></span>
          <span className={styles.alertDays}>{money(view.pendingCollectionTotal)}</span>
        </div>
        <div className={styles.alertItem}>
          <span className={styles.alertDot} />
          <span><strong>إجمالي الرواتب والبدلات</strong><span>الموظفون النشطون</span></span>
          <span className={styles.alertDays}>{money(data.payroll)}</span>
        </div>
        <div className={styles.alertItem}>
          <span className={styles.alertDot} />
          <span><strong>المستندات</strong><span>المسجلة في النظام</span></span>
          <span className={styles.alertDays}>{data.documentCount}</span>
        </div>
      </aside>
    </div>
  );
}
