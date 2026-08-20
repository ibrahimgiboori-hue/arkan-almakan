'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import styles from './project-workspace-shell.module.css';

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const [project, setProject] = useState(null);
  const inOperations = pathname.includes(`/dashboard/projects/${id}/operations`);

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
          {inOperations ? (
            <Link className={styles.secondaryAction} href={`/dashboard/projects/${id}`}>ملخص المشروع</Link>
          ) : (
            <Link className={styles.operationButton} href={`/dashboard/projects/${id}/operations`}>التشغيل اليومي</Link>
          )}
        </div>
      </header>

      <div className={`${styles.projectBody} ${inOperations ? styles.operationsBody : ''}`}>{children}</div>
    </section>
  );
}
