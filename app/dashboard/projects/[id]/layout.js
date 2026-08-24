'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import styles from './project-workspace-shell.module.css';

const PROJECT_TABS = [
  { key: 'summary', label: 'ملخص المشروع', suffix: '' },
  { key: 'operations', label: 'التشغيل اليومي', suffix: '/operations' },
  { key: 'documents', label: 'المستندات', suffix: '/documents' },
  { key: 'materials', label: 'المواد', suffix: '/materials' },
];

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const [project, setProject] = useState(null);
  const base = `/dashboard/projects/${id}`;
  const inOperations = pathname.startsWith(`${base}/operations`);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, project_no, name_ar, city, stage, supply_scope')
        .eq('id', id)
        .maybeSingle();
      if (active) setProject(data || null);
    })();
    return () => { active = false; };
  }, [id]);

  const isTabActive = (suffix) => {
    const href = `${base}${suffix}`;
    return suffix ? pathname.startsWith(href) : pathname === base;
  };

  return (
    <section className={`${styles.workspaceShell} ${inOperations ? styles.operationsWorkspace : ''}`} data-project-workspace="true">
      <header className={`${styles.projectHeader} ${inOperations ? styles.compactProjectHeader : ''}`}>
        <div className={styles.projectIdentity}>
          <Link className={styles.backLink} href="/dashboard/projects">← المشاريع</Link>
          <div className={styles.projectCode}>{project?.project_no || 'PROJECT'}</div>
          <h1>{project?.name_ar || 'المشروع'}</h1>
          <p>
            {[project?.city, STAGE_AR[project?.stage], SCOPE_AR[project?.supply_scope]]
              .filter(Boolean).join(' · ') || 'مساحة عمل المشروع'}
          </p>
        </div>
        <div className={styles.projectActions}>
          <Link className={styles.operationButton} href={`${base}/operations`}>التشغيل اليومي</Link>
        </div>
      </header>

      <nav className={styles.projectTabs} aria-label="أقسام المشروع">
        {PROJECT_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`${base}${tab.suffix}`}
            className={`${styles.projectTab} ${isTabActive(tab.suffix) ? styles.projectTabActive : ''}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className={`${styles.projectBody} ${inOperations ? styles.operationsBody : ''}`}>{children}</div>
    </section>
  );
}
