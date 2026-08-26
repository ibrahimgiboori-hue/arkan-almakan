'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STAGE_AR } from '@/lib/projects';
import {
  PROJECT_NAV_GROUPS,
  activeProjectNavigationKey,
  projectNavigationHref,
} from '@/lib/app-constitution';
import styles from './project-workspace-shell.module.css';

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(null);
  const view = searchParams.get('view');
  const activeKey = activeProjectNavigationKey({ projectId:id, pathname, view });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, project_no, name_ar, city, stage')
        .eq('id', id)
        .maybeSingle();
      if (active) setProject(data || null);
    })();
    return () => { active = false; };
  }, [id]);

  return (
    <section className={styles.workspaceShell} data-project-workspace="true">
      <aside className={styles.projectRail} aria-label="ملاحة المشروع">
        <div className={styles.projectIdentity}>
          <Link className={styles.backLink} href="/dashboard/projects">← كل المشاريع</Link>
          <div className={styles.projectCode}>{project?.project_no || 'PROJECT'}</div>
          <h1>{project?.name_ar || 'المشروع'}</h1>
          <div className={styles.projectMeta}>
            {project?.city && <span>{project.city}</span>}
            {project?.stage && <span>{STAGE_AR[project.stage] || project.stage}</span>}
          </div>
        </div>

        <nav className={styles.projectNav} aria-label="أقسام المشروع">
          {PROJECT_NAV_GROUPS.map((group) => (
            <section key={group.key} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{group.label}</div>
              <div className={styles.navGroupLinks}>
                {group.items.map((item) => {
                  const href = projectNavigationHref(id, item);
                  const active = activeKey === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                    >
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
        {children}
      </main>
    </section>
  );
}
