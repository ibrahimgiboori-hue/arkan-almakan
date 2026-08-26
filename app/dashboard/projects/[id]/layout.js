'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STAGE_AR } from '@/lib/projects';
import {
  PROJECT_NAV_GROUPS,
  activeProjectNavigationKey,
  projectNavigationHref,
} from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import styles from './project-workspace-shell.module.css';

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(undefined);
  const [access, setAccess] = useState({ ready:false, full:false, keys:new Set() });
  const view = searchParams.get('view');
  const activeKey = activeProjectNavigationKey({ projectId:id, pathname, view });

  useEffect(() => {
    let active = true;
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const userId = session?.user?.id || null;
      const [projectQ, capabilitiesQ, primaryQ, userQ] = await Promise.all([
        supabase.from('projects').select('id, project_no, name_ar, city, stage').eq('id', id).maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key'),
        supabase.rpc('fn_is_primary_user'),
        userId ? supabase.from('app_users').select('is_system_admin').eq('id', userId).maybeSingle() : Promise.resolve({ data:null, error:null }),
      ]);
      if (!active) return;
      const full = primaryQ.data === true || Boolean(userQ.data?.is_system_admin);
      const keys = new Set((capabilitiesQ.data || [])
        .filter((item) => item.scope_type === 'all' || (item.scope_type === 'project' && item.scope_key === id))
        .map((item) => item.capability_key));
      setProject(projectQ.data || null);
      setAccess({ ready:true, full, keys });
    })();
    return () => { active = false; };
  }, [id]);

  const visibleGroups = useMemo(() => PROJECT_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (access.full) return true;
      const required = projectNavRequirement(item.key);
      return required.length === 0 || required.some((key) => access.keys.has(key));
    }),
  })).filter((group) => group.items.length > 0), [access]);

  const activeAllowed = useMemo(() => {
    if (access.full || !activeKey) return true;
    const required = projectNavRequirement(activeKey);
    return required.length === 0 || required.some((key) => access.keys.has(key));
  }, [access, activeKey]);

  if (project === undefined || !access.ready) return <div className="empty">جارٍ فتح المشروع…</div>;

  if (!project) return (
    <div className="section" style={{padding:24,marginTop:0}}>
      <h2 style={{marginTop:0}}>المشروع غير متاح لهذا الحساب</h2>
      <p style={{lineHeight:1.9}}>لم يُسند هذا المشروع إلى المستخدم، أو لم يعد الحساب يملك صلاحية الاطلاع عليه.</p>
      <Link className="btn ghost" href="/dashboard/projects">العودة إلى المشاريع المتاحة</Link>
    </div>
  );

  return (
    <section className={styles.workspaceShell} data-project-workspace="true">
      <aside className={styles.projectRail} aria-label="ملاحة المشروع">
        <div className={styles.projectIdentity}>
          <Link className={styles.backLink} href="/dashboard/projects">← كل المشاريع</Link>
          <div className={styles.projectCode}>{project.project_no || 'PROJECT'}</div>
          <h1>{project.name_ar || 'المشروع'}</h1>
          <div className={styles.projectMeta}>
            {project.city && <span>{project.city}</span>}
            {project.stage && <span>{STAGE_AR[project.stage] || project.stage}</span>}
          </div>
        </div>

        <nav className={styles.projectNav} aria-label="أقسام المشروع">
          {visibleGroups.map((group) => (
            <section key={group.key} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{group.label}</div>
              <div className={styles.navGroupLinks}>
                {group.items.map((item) => {
                  const href = projectNavigationHref(id, item);
                  const active = activeKey === item.key;
                  return (
                    <Link key={item.key} href={href} aria-current={active ? 'page' : undefined} className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <main className={styles.projectMain}>
        {activeAllowed ? children : <div className="section" style={{padding:24,marginTop:0}}><h2 style={{marginTop:0}}>لا توجد صلاحية لهذا الجزء</h2><p style={{lineHeight:1.9}}>المشروع مسند إليك، لكن مستوى الصلاحية الحالي لا يسمح بفتح هذا الجزء.</p></div>}
      </main>
    </section>
  );
}
