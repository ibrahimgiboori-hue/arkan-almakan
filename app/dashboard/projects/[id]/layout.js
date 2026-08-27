'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PROJECT_NAV_GROUPS, activeProjectNavigationKey } from '@/lib/app-constitution';
import { projectNavRequirement } from '@/lib/access-ui';
import styles from './project-workspace-shell.module.css';

const PROJECT_ITEMS = PROJECT_NAV_GROUPS.flatMap((group) => group.items);

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState(undefined);
  const [access, setAccess] = useState({ ready:false, full:false, portalAll:false, projectFull:false, keys:new Set() });
  const view = searchParams.get('view');
  const activeKey = activeProjectNavigationKey({ projectId:id, pathname, view });
  const activeItem = PROJECT_ITEMS.find((item) => item.key === activeKey) || null;

  useEffect(() => {
    let active = true;
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const userId = session?.user?.id || null;
      const [projectQ, capabilitiesQ, primaryQ, userQ] = await Promise.all([
        supabase.from('projects').select('id, project_no, name_ar, city, stage').eq('id', id).maybeSingle(),
        supabase.from('v_my_capabilities').select('capability_key,scope_type,scope_key,source_key'),
        supabase.rpc('fn_is_primary_user'),
        userId ? supabase.from('app_users').select('is_system_admin').eq('id', userId).maybeSingle() : Promise.resolve({ data:null, error:null }),
      ]);
      if (!active) return;
      const full = primaryQ.data === true || Boolean(userQ.data?.is_system_admin);
      const capabilities = capabilitiesQ.data || [];
      const applicable = capabilities.filter((item) => item.scope_type === 'all' || (item.scope_type === 'project' && item.scope_key === id));
      const portalAll = applicable.some((item) => item.source_key === 'projects_full_access' && item.scope_type === 'all');
      const projectFull = portalAll || applicable.some((item) => item.source_key === 'projects_full_access' && item.scope_type === 'project' && item.scope_key === id);
      const keys = new Set(applicable.map((item) => item.capability_key));
      setProject(projectQ.data || null);
      setAccess({ ready:true, full, portalAll, projectFull, keys });
    })();
    return () => { active = false; };
  }, [id]);

  const activeAllowed = useMemo(() => {
    if (access.full || access.projectFull || !activeKey) return true;
    const required = projectNavRequirement(activeKey);
    return required.length === 0 || required.some((key) => access.keys.has(key));
  }, [access, activeKey]);

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/dashboard/workspace');
  }

  if (project === undefined || !access.ready) return <div className="empty">جارٍ فتح المشروع…</div>;

  if (!project) return (
    <section className={styles.focusWorkspaceShell} data-project-workspace="true" data-tool-theater="true">
      <header className={styles.toolBar}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="الرجوع إلى الشاشة السابقة">
          <span className={styles.backIcon} aria-hidden="true">→</span>
          <span>رجوع</span>
        </button>
      </header>
      <main className={styles.focusProjectMain}>
        <div className="section" style={{padding:24,marginTop:0}}>
          <h2 style={{marginTop:0}}>المشروع غير متاح لهذا الحساب</h2>
          <p style={{lineHeight:1.9}}>لم يُسند هذا المشروع إلى المستخدم، أو لم يعد الحساب يملك صلاحية الاطلاع عليه.</p>
        </div>
      </main>
    </section>
  );

  return (
    <section className={styles.focusWorkspaceShell} data-project-workspace="true" data-tool-theater="true">
      <header className={styles.toolBar}>
        <div className={styles.toolContext}>
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="الرجوع إلى الشاشة السابقة">
            <span className={styles.backIcon} aria-hidden="true">→</span>
            <span>رجوع</span>
          </button>
          <div className={styles.toolHeading}>
            <div className={styles.projectName}>{project.name_ar || 'المشروع'}{project.project_no ? <span>{project.project_no}</span> : null}</div>
            <h1>{activeItem?.label || 'المشروع'}</h1>
          </div>
        </div>
        <div className={styles.projectHint} aria-label="سياق المشروع">
          {project.city && <span>{project.city}</span>}
        </div>
      </header>

      <main className={styles.focusProjectMain}>
        {activeAllowed ? children : (
          <div className="section" style={{padding:24,marginTop:0}}>
            <h2 style={{marginTop:0}}>لا توجد صلاحية لهذه الأداة</h2>
            <p style={{lineHeight:1.9}}>المشروع مسند إليك، لكن مستوى الصلاحية الحالي لا يسمح بفتح هذه الأداة.</p>
          </div>
        )}
      </main>
    </section>
  );
}
