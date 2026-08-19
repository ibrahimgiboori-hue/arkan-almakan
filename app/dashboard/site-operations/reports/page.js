'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { assignmentOverlaps, dateRange, displayDate, isoDate } from '@/lib/timesheet-report.mjs';
import styles from './page.module.css';

const MODES = Object.freeze({
  worker:{
    label:'العامل هو المحور',
    description:'عامل واحد أو مجموعة مختارة من عمال المقاول، مع تفاصيل حضورهم وملخص أيامهم.',
  },
  contractor:{
    label:'اليوم أو الفترة هي المحور',
    description:'كشف جميع عمال المقاول في يوم محدد أو فترة من–إلى، بلا أجور أو تفاصيل مالية.',
  },
  paper:{
    label:'نموذج ورقي للمشرف',
    description:'كشف يومي جاهز بالأسماء ليضع المشرف ✓ أو ½ بخط اليد ثم يعيده للإدخال.',
  },
});

const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });
const today = () => isoDate(new Date());

export default function TimesheetReportCenter() {
  const [projects, setProjects] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [laborers, setLaborers] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [mode, setMode] = useState('worker');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [projectQuery, contractorQuery] = await Promise.all([
        supabase.from('projects').select('id,project_no,name_ar').eq('status', 'active').order('project_no'),
        supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias').order('name_ar'),
      ]);
      const firstError = projectQuery.error || contractorQuery.error;
      if (firstError) {
        setError(`تعذر تحميل بيانات التقارير: ${firstError.message}`);
        return;
      }
      const projectRows = projectQuery.data || [];
      setProjects(projectRows);
      setAllContractors(contractorQuery.data || []);
      const remembered = typeof window !== 'undefined' ? localStorage.getItem('arkan.site.project') : '';
      if (remembered && projectRows.some((project) => project.id === remembered)) setProjectId(remembered);
      else if (projectRows.length === 1) setProjectId(projectRows[0].id);
    })();
  }, []);

  useEffect(() => {
    setContractorId('');
    setSelected([]);
    setAssignments([]);
    setLaborers([]);
    if (!projectId) return;
    if (typeof window !== 'undefined') localStorage.setItem('arkan.site.project', projectId);
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const assignmentQuery = await supabase
        .from('labor_project_assignments')
        .select('id,laborer_id,contractor_id,valid_from,valid_to,labor_class,trade,is_active')
        .eq('project_id', projectId)
        .order('valid_from');
      if (!alive) return;
      if (assignmentQuery.error) {
        setError(`تعذر تحميل عمال المشروع: ${assignmentQuery.error.message}`);
        setLoading(false);
        return;
      }
      const assignmentRows = assignmentQuery.data || [];
      const ids = [...new Set(assignmentRows.map((row) => row.laborer_id).filter(Boolean))];
      let laborerRows = [];
      if (ids.length) {
        const laborerQuery = await supabase
          .from('laborers')
          .select('id,full_name,labor_class,trade,group_code,is_active')
          .in('id', ids)
          .order('full_name');
        if (laborerQuery.error) {
          setError(`تعذر تحميل أسماء العمال: ${laborerQuery.error.message}`);
          setLoading(false);
          return;
        }
        laborerRows = laborerQuery.data || [];
      }
      setAssignments(assignmentRows);
      setLaborers(laborerRows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId]);

  const contractorIds = useMemo(() => [...new Set(assignments.map((row) => row.contractor_id).filter(Boolean))], [assignments]);
  const contractors = useMemo(() => allContractors
    .filter((row) => contractorIds.includes(row.id))
    .sort((a, b) => naturalCompare(a.name_ar, b.name_ar)), [allContractors, contractorIds]);

  const roster = useMemo(() => {
    if (!contractorId || !from || !to || to < from) return [];
    const relevant = assignments.filter((row) => row.contractor_id === contractorId && assignmentOverlaps(row, from, mode === 'paper' ? from : to));
    const latestByWorker = new Map();
    relevant.forEach((row) => {
      const current = latestByWorker.get(row.laborer_id);
      if (!current || String(row.valid_from || '').localeCompare(String(current.valid_from || '')) > 0) latestByWorker.set(row.laborer_id, row);
    });
    const laborerById = Object.fromEntries(laborers.map((row) => [row.id, row]));
    return [...latestByWorker.values()].map((assignment) => {
      const worker = laborerById[assignment.laborer_id] || {};
      return {
        id:assignment.laborer_id,
        name:worker.full_name || '—',
        trade:assignment.trade || worker.trade || '',
        laborClass:assignment.labor_class || worker.labor_class || '',
        from:assignment.valid_from,
        to:assignment.valid_to,
      };
    }).sort((a, b) => naturalCompare(a.name, b.name));
  }, [assignments, laborers, contractorId, from, to, mode]);

  useEffect(() => {
    const available = new Set(roster.map((worker) => worker.id));
    setSelected((current) => current.filter((id) => available.has(id)));
  }, [roster]);

  const contractor = contractors.find((row) => row.id === contractorId);
  const selectedProject = projects.find((row) => row.id === projectId);

  function changeMode(nextMode) {
    setMode(nextMode);
    setSelected([]);
    if (nextMode === 'paper') setTo(from);
  }

  function toggleWorker(id) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function openReport() {
    setError('');
    if (!projectId) return setError('اختر المشروع أولاً.');
    if (!contractorId) return setError('اختر المقاول حتى يظل التقرير محددًا وواضحًا.');
    if (!from || (mode !== 'paper' && !to) || (mode !== 'paper' && to < from)) return setError('راجع تاريخ البداية والنهاية.');
    if (!dateRange(from, mode === 'paper' ? from : to).length) return setError('الفترة يجب أن تكون صحيحة وألا تتجاوز 370 يومًا في التقرير الواحد.');
    if (!roster.length) return setError('لا توجد عمالة مسندة لهذا المقاول في التاريخ أو الفترة المختارة.');
    if (mode === 'worker' && !selected.length) return setError('اختر عاملًا واحدًا على الأقل.');

    const params = new URLSearchParams({
      mode,
      project:projectId,
      contractor:contractorId,
      from,
      to:mode === 'paper' ? from : to,
    });
    if (mode === 'worker') params.set('workers', selected.join(','));
    window.open(`/print/timesheet?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div dir="rtl" className={styles.root}>
      <div className="page-head">
        <div>
          <h1>تقارير التايم شيت</h1>
          <p>اختر ما تريد فهمه أولًا: العامل، اليوم أو الفترة، أو ورقة حضور يدوية للمشرف.</p>
        </div>
        <Link className="btn ghost" href="/dashboard/site-operations">العودة إلى التشغيل اليومي</Link>
      </div>

      <section className={styles.modeGrid} aria-label="نوع التقرير">
        {Object.entries(MODES).map(([key, value]) => (
          <button type="button" key={key} className={`${styles.modeCard} ${mode === key ? styles.active : ''}`} onClick={() => changeMode(key)}>
            <b>{value.label}</b>
            <span>{value.description}</span>
          </button>
        ))}
      </section>

      <section className={styles.builder}>
        <header>
          <div>
            <h2>{MODES[mode].label}</h2>
            <span>التقرير الرسمي يعرض الحضور فقط ولا يعرض الأجور أو تكلفة العامل.</span>
          </div>
          {selectedProject && <small>{selectedProject.project_no} — {selectedProject.name_ar}</small>}
        </header>

        <div className={styles.fields}>
          <div className="field">
            <label>المشروع</label>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">— اختر المشروع —</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.project_no} — {project.name_ar}</option>)}
            </select>
          </div>
          <div className="field">
            <label>المقاول</label>
            <select value={contractorId} onChange={(event) => { setContractorId(event.target.value); setSelected([]); }} disabled={!projectId || loading}>
              <option value="">— اختر المقاول —</option>
              {contractors.map((row) => <option key={row.id} value={row.id}>{row.operation_alias || row.name_ar}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{mode === 'paper' ? 'تاريخ الورقة' : 'من'}</label>
            <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); if (mode === 'paper') setTo(event.target.value); }} />
          </div>
          {mode !== 'paper' && (
            <div className="field">
              <label>إلى</label>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          )}
        </div>

        {mode !== 'paper' && (
          <div className={styles.quickDates}>
            <span>اختيار سريع:</span>
            <button type="button" onClick={() => { const value = today(); setFrom(value); setTo(value); }}>اليوم فقط</button>
            <button type="button" onClick={() => { const value = today(); const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() - 6); setFrom(isoDate(date)); setTo(value); }}>آخر 7 أيام</button>
            <button type="button" onClick={() => { const value = today(); const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() - 29); setFrom(isoDate(date)); setTo(value); }}>آخر 30 يومًا</button>
          </div>
        )}

        {contractorId && (
          <div className={styles.rosterSummary}>
            <div>
              <b>{contractor?.operation_alias || contractor?.name_ar}</b>
              <span>{roster.length} عاملًا داخل الفترة المختارة</span>
            </div>
            {mode === 'worker' && roster.length > 0 && (
              <button type="button" onClick={() => setSelected(selected.length === roster.length ? [] : roster.map((worker) => worker.id))}>
                {selected.length === roster.length ? 'إلغاء تحديد الكل' : 'تحديد كل العمال'}
              </button>
            )}
          </div>
        )}

        {mode === 'worker' && contractorId && (
          <div className={styles.workerList}>
            {loading ? <div className={styles.empty}>جارٍ تحميل الأسماء…</div> : roster.map((worker) => (
              <label key={worker.id} className={selected.includes(worker.id) ? styles.workerSelected : ''}>
                <input type="checkbox" checked={selected.includes(worker.id)} onChange={() => toggleWorker(worker.id)} />
                <span><b>{worker.name}</b><small>{worker.trade || 'عامل'} · {displayDate(worker.from)} — {worker.to ? displayDate(worker.to) : 'مستمرة'}</small></span>
              </label>
            ))}
            {!loading && roster.length === 0 && <div className={styles.empty}>لا توجد أسماء لهذا المقاول داخل الفترة المختارة.</div>}
          </div>
        )}

        {mode === 'paper' && contractorId && roster.length > 0 && (
          <div className={styles.paperNote}>
            ستخرج الورقة بأسماء {roster.length} عاملًا المتاحين في {displayDate(from)}، وخانة علامة الحضور وخانة الملاحظات وتوقيع المشرف.
          </div>
        )}

        {error && <div className="msg err">{error}</div>}

        <div className={styles.actions}>
          <button type="button" className="btn" onClick={openReport} disabled={loading}>
            {mode === 'paper' ? 'فتح النموذج وطباعته' : 'فتح التقرير وطباعته'}
          </button>
          <span>✓ يوم كامل · ½ نصف يوم · غ غياب مسجل · — غير مسجل</span>
        </div>
      </section>

      <section className={styles.mobilePlan}>
        <div>
          <b>التسجيل من الهاتف سيكون بحساب مشرف، لا برابط عام</b>
          <span>الخطوة التالية تربط المشرف بمشروع ومقاول محددين، وتسمح له بحفظ يومه فقط مع إيصال تدقيق باسم القائم بالتسجيل.</span>
        </div>
        <span className={styles.secure}>صلاحية محددة · تسجيل دخول · أثر تدقيق</span>
      </section>
    </div>
  );
}
