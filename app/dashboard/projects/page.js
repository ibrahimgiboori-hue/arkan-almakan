'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { useLiveRefresh } from '@/lib/live';
import styles from './projects-redesign.module.css';

function pct(v) {
  const n = Number(v || 0);
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

export default function Projects() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [fin, setFin] = useState({});
  const [emps, setEmps] = useState([]);
  const [role, setRole] = useState(null);
  const [stage, setStage] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    const sess = (await supabase.auth.getSession()).data.session;
    const [p, f, e, u] = await Promise.all([
      supabase.from('projects')
        .select('id, project_no, name_ar, city, stage, status, supply_scope, contract_value, supervisor_id, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('v_project_financials')
        .select('project_id, current_profit, pending_collection, items_without_decision, computed_progress_pct'),
      supabase.from('employees').select('id, full_name_ar, employee_no').order('employee_no'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);

    if (p.error) {
      setErr('تعذر تحميل المشاريع: ' + p.error.message);
      setRows([]);
      return;
    }

    const projectRows = p.data || [];
    setRows(projectRows);

    const m = {};
    if (!f.error) (f.data || []).forEach((x) => { m[x.project_id] = x; });
    setFin(m);
    setEmps(e.error ? [] : (e.data || []));
    setRole(u.error ? null : (u.data?.role || null));
    setSelectedId((current) => current && projectRows.some((r) => r.id === current)
      ? current
      : (projectRows[0]?.id || null));
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['all']);

  async function create() {
    setErr(''); setBusy(true);
    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: 'PROJECT', p_prefix: 'PRJ' });
    if (e1) { setErr('تعذّر توليد الرقم: ' + e1.message); setBusy(false); return; }

    const { data, error } = await supabase.from('projects').insert({
      project_no: num,
      name_ar: 'مشروع جديد',
      stage: 'opportunity',
      status: 'active',
      supply_scope: 'labor_only',
    }).select('id').single();

    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    router.push(`/dashboard/projects/${data.id}`);
  }

  async function remove(r) {
    if (!window.confirm(`حذف مشروع «${r.name_ar}» وكل بنوده ومستخلصاته؟`)) return;
    const { error } = await supabase.from('projects').delete().eq('id', r.id);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذف المشروع');
    await load();
  }

  async function setStage2(r, value) {
    const { error } = await supabase.from('projects').update({ stage: value }).eq('id', r.id);
    if (error) setErr(error.message); else await load();
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r) => stage === 'all' || r.stage === stage)
      .filter((r) => !t || [r.name_ar, r.project_no, r.city]
        .filter(Boolean).some((v) => String(v).includes(t)));
  }, [rows, stage, q]);

  useEffect(() => {
    if (!list.length) return;
    if (!list.some((r) => r.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId]);

  if (!rows) return <div className="empty">جارٍ تحميل المشاريع…</div>;

  const canWrite = ['ceo', 'hr', 'accountant'].includes(role);
  const selected = rows.find((r) => r.id === selectedId) || list[0] || null;
  const sf = selected ? (fin[selected.id] || {}) : {};
  const selectedSupervisor = selected ? emps.find((e) => e.id === selected.supervisor_id) : null;
  const progress = pct(sf.computed_progress_pct);
  const profit = Number(sf.current_profit || 0);
  const pending = Number(sf.pending_collection || 0);
  const undecided = Number(sf.items_without_decision || 0);
  const executionCount = rows.filter((r) => r.stage === 'execution').length;
  const totalPending = rows.reduce((sum, r) => sum + Number(fin[r.id]?.pending_collection || 0), 0);

  return (
    <div className={styles.workspace}>
      <aside className={styles.index}>
        <div className={styles.indexHead}>
          <div className={styles.indexTitleRow}>
            <h1 className={styles.indexTitle}>المشاريع</h1>
            <span className={styles.indexCount}>{executionCount} تنفيذ · {rows.length} إجمالي</span>
          </div>
          <input
            className={styles.search}
            placeholder="ابحث باسم المشروع أو رقمه أو المدينة"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className={styles.filterRow}>
            <button className={`${styles.filter} ${stage === 'all' ? styles.filterActive : ''}`} onClick={() => setStage('all')}>الكل</button>
            <button className={`${styles.filter} ${stage === 'execution' ? styles.filterActive : ''}`} onClick={() => setStage('execution')}>قيد التنفيذ</button>
            <button className={`${styles.filter} ${stage === 'opportunity' ? styles.filterActive : ''}`} onClick={() => setStage('opportunity')}>فرص</button>
          </div>
        </div>

        <div className={styles.projectList}>
          {err && <div className={`${styles.message} ${styles.error}`}>{err}</div>}
          {list.length === 0 ? (
            <div className={styles.emptyList}>لا توجد مشاريع مطابقة للبحث أو الفلتر الحالي.</div>
          ) : list.map((r) => {
            const f = fin[r.id] || {};
            const p = pct(f.computed_progress_pct);
            return (
              <button
                key={r.id}
                className={`${styles.projectItem} ${selected?.id === r.id ? styles.projectItemActive : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className={styles.projectTop}>
                  <span className={styles.projectName}>{r.name_ar}</span>
                  <span className={styles.stage}>{STAGE_AR[r.stage] || r.stage}</span>
                </div>
                <div className={styles.projectSub}>
                  <span>{r.project_no || 'بدون رقم'}</span>
                  <span>{r.city || SCOPE_AR[r.supply_scope] || '—'}</span>
                </div>
                <div className={styles.progress}><span style={{ width: `${p}%` }} /></div>
                <div className={styles.projectMeta}>
                  <span>{p.toFixed(0)}% إنجاز</span>
                  <span>{money(f.pending_collection || 0)} مستحق</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className={styles.detail}>
        {msg && <div className={`${styles.message} ${styles.success}`}>{msg}</div>}
        {!selected ? (
          <div className={styles.emptyList}>اختر مشروعًا لعرض مساحة العمل.</div>
        ) : (
          <>
            <header className={styles.detailHeader}>
              <div>
                <div className={styles.eyebrow}>PROJECT / {selected.project_no || '—'}</div>
                <h1 className={styles.detailTitle}>{selected.name_ar}</h1>
                <p className={styles.detailSub}>
                  {[selected.city, SCOPE_AR[selected.supply_scope], selectedSupervisor?.full_name_ar ? `المشرف: ${selectedSupervisor.full_name_ar}` : null]
                    .filter(Boolean).join(' · ') || 'بيانات المشروع الأساسية'}
                </p>
              </div>
              <div className={styles.actions}>
                {canWrite && (
                  <button className={styles.buttonPrimary} onClick={create} disabled={busy}>
                    {busy ? 'جارٍ الإنشاء…' : '+ مشروع جديد'}
                  </button>
                )}
                <Link className={styles.button} href={`/dashboard/projects/${selected.id}`}>فتح التفاصيل الكاملة</Link>
                {canWrite && <button className={`${styles.button} ${styles.deleteButton}`} onClick={() => remove(selected)}>حذف</button>}
              </div>
            </header>

            <section className={styles.statStrip}>
              <div className={styles.stat}><strong className={styles.statValue}>{progress.toFixed(0)}%</strong><span className={styles.statLabel}>الإنجاز المحسوب</span></div>
              <div className={styles.stat}><strong className={styles.statValue}>{money(selected.contract_value)}</strong><span className={styles.statLabel}>قيمة العقد</span></div>
              <div className={styles.stat}><strong className={`${styles.statValue} ${pending > 0 ? styles.warn : ''}`}>{money(pending)}</strong><span className={styles.statLabel}>مستحق ولم يُحصّل</span></div>
              <div className={styles.stat}><strong className={`${styles.statValue} ${undecided ? styles.danger : styles.good}`}>{undecided}</strong><span className={styles.statLabel}>بنود بلا قرار تنفيذ</span></div>
            </section>

            <section className={styles.heroGrid}>
              <div className={styles.progressPanel}>
                <div className={styles.progressTop}>
                  <strong className={styles.progressBig}>{progress.toFixed(0)}%</strong>
                  <span className={styles.progressCaption}>صورة الإنجاز الحالية من بيانات المشروع الفعلية</span>
                </div>
                <div className={styles.progressRail}><span style={{ width: `${progress}%` }} /></div>
                <div className={styles.progressFoot}>
                  <span>المرحلة: {STAGE_AR[selected.stage] || selected.stage}</span>
                  <span>النطاق: {SCOPE_AR[selected.supply_scope] || 'غير محدد'}</span>
                </div>
              </div>

              <div className={styles.financePanel}>
                <div className={styles.eyebrow}>CURRENT PROFIT</div>
                <strong className={styles.financeValue}>{money(profit)} ر.س</strong>
                <span className={styles.financeCopy}>الربح الحالي بحسب منظور المشروع المالي، مع إبقاء الاستحقاقات غير المحصلة منفصلة.</span>
                <div className={styles.financeRows}>
                  <div className={styles.financeRow}><span>مستحق ولم يُحصّل</span><strong>{money(pending)}</strong></div>
                  <div className={styles.financeRow}><span>إجمالي مستحقات كل المشاريع</span><strong>{money(totalPending)}</strong></div>
                </div>
              </div>
            </section>

            <section className={styles.contentGrid}>
              <div>
                <div className={styles.sectionTitle}><h2>المشروع الآن</h2><span>معلومات تشغيلية قابلة للتصرف</span></div>
                <div className={styles.timeline}>
                  <div className={styles.row}>
                    <div className={styles.rowTitle}><strong>حالة المشروع</strong><span>يمكن تعديل المرحلة هنا دون مغادرة مساحة العمل.</span></div>
                    <div>
                      {canWrite ? (
                        <select className={styles.stageSelect} value={selected.stage} onChange={(e) => setStage2(selected, e.target.value)}>
                          {Object.entries(STAGE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : <span>{STAGE_AR[selected.stage] || selected.stage}</span>}
                    </div>
                    <div className={styles.metric}><strong>{selected.status || '—'}</strong>الحالة النظامية</div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.rowTitle}><strong>المشرف</strong><span>المسؤول المرتبط بالمشروع في السجل الحالي.</span></div>
                    <div>{selectedSupervisor?.full_name_ar || 'غير محدد'}</div>
                    <div className={styles.metric}><strong>{selectedSupervisor?.employee_no || '—'}</strong>الرقم الوظيفي</div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.rowTitle}><strong>رقم المشروع</strong><span>المرجع الرئيسي للمشروع في المستندات والمراسلات.</span></div>
                    <div>{selected.project_no || 'غير محدد'}</div>
                    <div className={styles.metric}><strong>{selected.city || '—'}</strong>المدينة</div>
                  </div>
                </div>
              </div>

              <div>
                <div className={styles.sectionTitle}><h2>ما يحتاج انتباهًا</h2><span>حسب بيانات المشروع</span></div>
                <div className={styles.quickList}>
                  <div className={styles.quickItem}><div><strong>بنود بلا قرار تنفيذ</strong><span>لا ينبغي أن يبدأ تنفيذها قبل القرار.</span></div><strong className={`${styles.quickValue} ${undecided ? styles.danger : styles.good}`}>{undecided}</strong></div>
                  <div className={styles.quickItem}><div><strong>مبالغ غير محصلة</strong><span>مستخلصات مقدمة أو مفوترة بحسب المنظور المالي.</span></div><strong className={`${styles.quickValue} ${pending > 0 ? styles.warn : styles.good}`}>{money(pending)}</strong></div>
                  <div className={styles.quickItem}><div><strong>نسبة الإنجاز</strong><span>الإنجاز المحسوب من بيانات المشروع الحالية.</span></div><strong className={styles.quickValue}>{progress.toFixed(0)}%</strong></div>
                </div>
                <div className={styles.actions} style={{ marginTop: 14 }}>
                  <Link className={styles.buttonPrimary} href={`/dashboard/projects/${selected.id}`}>العمل داخل المشروع</Link>
                  <Link className={styles.button} href="/dashboard/site-operations">التشغيل اليومي</Link>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
