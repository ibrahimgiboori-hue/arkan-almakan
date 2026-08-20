'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { useLiveRefresh } from '@/lib/live';
import styles from './projects-redesign.module.css';

function pct(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

export default function Projects() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [fin, setFin] = useState({});
  const [role, setRole] = useState(null);
  const [stage, setStage] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    const session = (await supabase.auth.getSession()).data.session;
    const [projectsQ, financialsQ, userQ] = await Promise.all([
      supabase.from('projects')
        .select('id, project_no, name_ar, city, stage, status, supply_scope, contract_value, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('v_project_financials')
        .select('project_id, current_profit, pending_collection, items_without_decision, computed_progress_pct'),
      supabase.from('app_users').select('role').eq('id', session?.user?.id).maybeSingle(),
    ]);

    if (projectsQ.error) {
      setErr('تعذر تحميل المشاريع: ' + projectsQ.error.message);
      setRows([]);
      return;
    }

    const map = {};
    if (!financialsQ.error) {
      (financialsQ.data || []).forEach((item) => { map[item.project_id] = item; });
    }

    setRows(projectsQ.data || []);
    setFin(map);
    setRole(userQ.error ? null : (userQ.data?.role || null));
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['all']);

  async function createProject() {
    setErr('');
    setBusy(true);
    const { data: number, error: numberError } = await supabase
      .rpc('next_document_number', { p_doc_type: 'PROJECT', p_prefix: 'PRJ' });

    if (numberError) {
      setErr('تعذّر توليد رقم المشروع: ' + numberError.message);
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.from('projects').insert({
      project_no: number,
      name_ar: 'مشروع جديد',
      stage: 'opportunity',
      status: 'active',
      supply_scope: 'labor_only',
    }).select('id').single();

    setBusy(false);
    if (error) {
      setErr('تعذّر إنشاء المشروع: ' + error.message);
      return;
    }
    router.push(`/dashboard/projects/${data.id}`);
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows
      .filter((row) => stage === 'all' || row.stage === stage)
      .filter((row) => !term || [row.name_ar, row.project_no, row.city]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)));
  }, [rows, stage, q]);

  if (!rows) return <div className="empty">جارٍ تحميل المشاريع…</div>;

  const canWrite = ['ceo', 'hr', 'accountant'].includes(role);
  const executionCount = rows.filter((row) => row.stage === 'execution').length;
  const opportunityCount = rows.filter((row) => ['opportunity', 'pricing', 'submitted'].includes(row.stage)).length;

  return (
    <main className={styles.projectsHome}>
      <header className={styles.homeHeader}>
        <div>
          <div className={styles.eyebrow}>PROJECTS</div>
          <h1>المشاريع</h1>
          <p>اختر المشروع الذي تريد العمل عليه. بعد الدخول إليه تختفي بقية المشاريع وتصبح الشاشة لمساحة ذلك المشروع فقط.</p>
        </div>
        {canWrite && (
          <button className={styles.addButton} onClick={createProject} disabled={busy}>
            {busy ? 'جارٍ الإنشاء…' : '+ إضافة مشروع'}
          </button>
        )}
      </header>

      <section className={styles.summaryStrip} aria-label="ملخص المشاريع">
        <div><strong>{rows.length}</strong><span>إجمالي المشاريع</span></div>
        <div><strong>{executionCount}</strong><span>قيد التنفيذ</span></div>
        <div><strong>{opportunityCount}</strong><span>فرص وتسعير</span></div>
      </section>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ابحث باسم المشروع أو رقمه أو المدينة"
          aria-label="بحث في المشاريع"
        />
        <div className={styles.filters}>
          <button className={`${styles.filter} ${stage === 'all' ? styles.filterActive : ''}`} onClick={() => setStage('all')}>الكل</button>
          <button className={`${styles.filter} ${stage === 'execution' ? styles.filterActive : ''}`} onClick={() => setStage('execution')}>قيد التنفيذ</button>
          <button className={`${styles.filter} ${stage === 'opportunity' ? styles.filterActive : ''}`} onClick={() => setStage('opportunity')}>فرص</button>
        </div>
      </div>

      {err && <div className={styles.error}>{err}</div>}

      {list.length === 0 ? (
        <div className={styles.emptyState}>لا توجد مشاريع مطابقة للبحث أو الفلتر الحالي.</div>
      ) : (
        <section className={styles.projectGrid} aria-label="بطاقات المشاريع">
          {list.map((project) => {
            const f = fin[project.id] || {};
            const progress = pct(f.computed_progress_pct);
            const pending = Number(f.pending_collection || 0);
            const undecided = Number(f.items_without_decision || 0);
            const profit = Number(f.current_profit || 0);

            return (
              <button
                key={project.id}
                className={styles.projectCard}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardIdentity}>
                    <span className={styles.projectNo}>{project.project_no || 'بدون رقم'}</span>
                    <h2>{project.name_ar}</h2>
                  </div>
                  <span className={`${styles.stageBadge} ${project.stage === 'execution' ? styles.stageExecution : ''}`}>
                    {STAGE_AR[project.stage] || project.stage || '—'}
                  </span>
                </div>

                <div className={styles.cardMeta}>
                  <span>{project.city || 'المدينة غير محددة'}</span>
                  <span>{SCOPE_AR[project.supply_scope] || 'النطاق غير محدد'}</span>
                </div>

                <div className={styles.progressBlock}>
                  <div className={styles.progressLabel}>
                    <span>الإنجاز</span>
                    <strong>{progress.toFixed(0)}%</strong>
                  </div>
                  <div className={styles.progressRail}><span style={{ width: `${progress}%` }} /></div>
                </div>

                <div className={styles.cardNumbers}>
                  <div><span>قيمة العقد</span><strong>{money(project.contract_value || 0)}</strong></div>
                  <div><span>غير محصل</span><strong className={pending > 0 ? styles.warn : ''}>{money(pending)}</strong></div>
                  <div><span>الربح الحالي</span><strong className={profit < 0 ? styles.danger : ''}>{money(profit)}</strong></div>
                </div>

                <div className={styles.cardFoot}>
                  <span>{undecided > 0 ? `${undecided} بند بلا قرار تنفيذ` : 'لا توجد قرارات تنفيذ معلقة'}</span>
                  <strong>فتح المشروع ←</strong>
                </div>
              </button>
            );
          })}
        </section>
      )}
    </main>
  );
}
