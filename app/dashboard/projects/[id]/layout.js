'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import styles from './project-workspace-shell.module.css';

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);

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

  function openOperations() {
    if (typeof window !== 'undefined') localStorage.setItem('arkan.site.project', id);
    router.push('/dashboard/site-operations');
  }

  return (
    <section className={styles.workspaceShell}>
      <header className={styles.projectHeader}>
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
          <button className={styles.operationButton} onClick={openOperations}>التشغيل اليومي</button>
        </div>
      </header>

      <div className={styles.projectBody}>{children}</div>
    </section>
  );
}
