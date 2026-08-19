'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { laborClassSummaryLabel, summarizeLaborClasses } from '@/lib/labor-class-summary.mjs';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy } from '@/lib/print-governance';
import {
  arabicDayName,
  assignmentOverlaps,
  buildAttendanceMap,
  chunk,
  dateRange,
  displayDate,
  statusDefinition,
  summarizeAttendance,
  workerPeriodDays,
} from '@/lib/timesheet-report.mjs';
import './timesheet-report.css';

const REPORT_LAYOUT = getPrintLayoutPolicy('timesheet_report');
const VALID_MODES = new Set(['worker', 'contractor', 'paper']);
const CLASS_AR = Object.freeze({ worker:'عامل', technician:'صنايعي', foreman:'مراقب' });
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });

function periodLabel(from, to) {
  return from === to ? displayDate(from) : `${displayDate(from)} — ${displayDate(to)}`;
}

function reportTitle(mode, workers, from, to) {
  if (mode === 'paper') return 'نموذج حضور عمال — تسجيل يدوي';
  if (mode === 'worker' && workers.length === 1) return 'كشف حضور عامل';
  if (mode === 'worker') return 'كشف حضور عمال مختارين';
  return from === to ? 'كشف حضور عمال — يومي' : 'كشف حضور عمال — فترة';
}

export default function TimesheetPrintPage() {
  const [query, setQuery] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [project, setProject] = useState(null);
  const [contractor, setContractor] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'contractor';
    const parsed = {
      mode:VALID_MODES.has(mode) ? mode : 'contractor',
      projectId:params.get('project') || '',
      contractorId:params.get('contractor') || '',
      from:params.get('from') || '',
      to:params.get('to') || params.get('from') || '',
      workerIds:(params.get('workers') || '').split(',').filter(Boolean),
    };
    setQuery(parsed);
  }, []);

  useEffect(() => {
    if (!query) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      if (!query.projectId || !query.contractorId || !query.from || !query.to || query.to < query.from) {
        setError('بيانات التقرير غير مكتملة. ارجع إلى مركز تقارير التايم شيت وأعد الاختيار.');
        setLoading(false);
        return;
      }

      const [settingsQuery, projectQuery, contractorQuery, assignmentQuery] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('projects').select('id,project_no,name_ar,city,site_address').eq('id', query.projectId).maybeSingle(),
        supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias').eq('id', query.contractorId).maybeSingle(),
        supabase.from('labor_project_assignments')
          .select('id,laborer_id,contractor_id,valid_from,valid_to,labor_class,trade')
          .eq('project_id', query.projectId)
          .eq('contractor_id', query.contractorId)
          .lte('valid_from', query.to)
          .or(`valid_to.is.null,valid_to.gte.${query.from}`),
      ]);

      const firstError = settingsQuery.error || projectQuery.error || contractorQuery.error || assignmentQuery.error;
      if (!alive) return;
      if (firstError) {
        setError(`تعذر تحميل التقرير: ${firstError.message}`);
        setLoading(false);
        return;
      }

      let attendanceQuery = supabase.from('v_day_attendance')
        .select('attendance_id,laborer_id,laborer_name,labor_class,trade,contractor_id,work_date,status,stop_reason,notes,is_holiday,weather_stop')
        .eq('project_id', query.projectId)
        .eq('contractor_id', query.contractorId)
        .gte('work_date', query.from)
        .lte('work_date', query.to)
        .order('work_date');
      if (query.mode === 'worker' && query.workerIds.length) attendanceQuery = attendanceQuery.in('laborer_id', query.workerIds);
      const attendanceResult = await attendanceQuery;
      if (!alive) return;
      if (attendanceResult.error) {
        setError(`تعذر تحميل سجلات الحضور: ${attendanceResult.error.message}`);
        setLoading(false);
        return;
      }

      const attendanceRows = attendanceResult.data || [];
      let assignmentRows = (assignmentQuery.data || []).filter((row) => assignmentOverlaps(row, query.from, query.to));
      if (query.mode === 'worker') {
        const wanted = new Set(query.workerIds);
        assignmentRows = assignmentRows.filter((row) => wanted.has(row.laborer_id));
      }

      const laborerIds = [...new Set([
        ...assignmentRows.map((row) => row.laborer_id),
        ...attendanceRows.map((row) => row.laborer_id),
        ...(query.mode === 'worker' ? query.workerIds : []),
      ].filter(Boolean))];
      let laborerRows = [];
      if (laborerIds.length) {
        const laborerResult = await supabase.from('laborers')
          .select('id,full_name,labor_class,trade,group_code')
          .in('id', laborerIds);
        if (!alive) return;
        if (laborerResult.error) {
          setError(`تعذر تحميل أسماء العمال: ${laborerResult.error.message}`);
          setLoading(false);
          return;
        }
        laborerRows = laborerResult.data || [];
      }

      const laborerById = Object.fromEntries(laborerRows.map((row) => [row.id, row]));
      const attendanceByWorker = new Map();
      attendanceRows.forEach((row) => {
        if (!attendanceByWorker.has(row.laborer_id)) attendanceByWorker.set(row.laborer_id, row);
      });
      const assignmentByWorker = new Map();
      assignmentRows.sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || ''))).forEach((row) => {
        if (!assignmentByWorker.has(row.laborer_id)) assignmentByWorker.set(row.laborer_id, row);
      });

      let ids = [...new Set([...assignmentByWorker.keys(), ...attendanceByWorker.keys()])];
      if (query.mode === 'worker') {
        const available = new Set(ids);
        ids = query.workerIds.filter((id) => available.has(id));
      }
      const workerRows = ids.map((id) => {
        const laborer = laborerById[id] || {};
        const assignment = assignmentByWorker.get(id) || {};
        const historical = attendanceByWorker.get(id) || {};
        return {
          id,
          name:laborer.full_name || historical.laborer_name || '—',
          trade:assignment.trade || historical.trade || laborer.trade || '',
          laborClass:assignment.labor_class || historical.labor_class || laborer.labor_class || '',
          groupCode:laborer.group_code || '',
        };
      }).sort((a, b) => naturalCompare(a.name, b.name));

      setCfg(settingsQuery.data);
      setProject(projectQuery.data);
      setContractor(contractorQuery.data);
      setWorkers(workerRows);
      setAttendance(attendanceRows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [query]);

  const dates = useMemo(() => query ? dateRange(query.from, query.to) : [], [query]);
  const attendanceMap = useMemo(() => buildAttendanceMap(attendance), [attendance]);
  const summary = useMemo(() => summarizeAttendance(attendance, workers.map((worker) => worker.id)), [attendance, workers]);
  const laborClasses = useMemo(() => summarizeLaborClasses(workers), [workers]);

  if (loading || !query) return <div className="timesheet-print-loading">جارٍ إعداد التقرير…</div>;
  if (error) return <div className="timesheet-print-loading error">{error}</div>;
  if (!cfg || !project || !contractor) return <div className="timesheet-print-loading error">لم تكتمل بيانات التقرير.</div>;

  const title = reportTitle(query.mode, workers, query.from, query.to);
  const matrixDatePages = chunk(dates, 7);
  const matrixWorkerPages = chunk(workers, dates.length === 1 ? 22 : 16);
  const detailDatePages = chunk(dates, 22);
  const paperWorkerPages = chunk(workers, 18);
  const pageModels = [];

  if (query.mode === 'paper') {
    paperWorkerPages.forEach((workerPage, workerPageIndex) => pageModels.push({
      kind:'paper', workers:workerPage, workerPageIndex, workerPageCount:paperWorkerPages.length,
    }));
  } else if (query.mode === 'worker' && workers.length === 1) {
    detailDatePages.forEach((datePage, datePageIndex) => pageModels.push({
      kind:'detail', dates:datePage, datePageIndex, datePageCount:detailDatePages.length,
    }));
  } else {
    matrixDatePages.forEach((datePage, datePageIndex) => matrixWorkerPages.forEach((workerPage, workerPageIndex) => pageModels.push({
      kind:'matrix', dates:datePage, workers:workerPage, datePageIndex, datePageCount:matrixDatePages.length,
      workerPageIndex, workerPageCount:matrixWorkerPages.length,
    })));
  }

  const pageTitle = (subline = '') => (
    <>
      <div className="ts-doc-meta"><span>{cfg.company_name_ar}</span><span>{displayDate(new Date())}</span></div>
      <div className="ts-doc-title"><h1>{title}</h1><span /></div>
      <table className="ts-info-table">
        <tbody>
          <tr><th>المشروع</th><td>{project.project_no} — {project.name_ar}</td><th>المقاول</th><td>{contractor.name_ar}</td></tr>
          <tr><th>الفترة</th><td className="ltr">{periodLabel(query.from, query.to)}</td><th>نوع الكشف</th><td>{query.mode === 'paper' ? 'ورقي للتسجيل اليدوي' : 'حضور مسجل في النظام'}</td></tr>
          <tr><th>تركيب العمالة</th><td colSpan={3}>{laborClasses.total} فردًا — {laborClassSummaryLabel(laborClasses)}</td></tr>
        </tbody>
      </table>
      {subline && <div className="ts-page-subline">{subline}</div>}
    </>
  );

  const reportSummary = () => (
    <div className="ts-summary">
      <span><b>{laborClasses.total}</b> فردًا</span>
      <span><b>{summary.full}</b> حضور كامل</span>
      <span><b>{summary.half}</b> نصف يوم</span>
      <span><b>{summary.workdays}</b> مجموع اليوميات</span>
    </div>
  );

  const legend = () => (
    <div className="ts-legend">
      <span><b>✓</b> يوم كامل</span><span><b>½</b> نصف يوم</span><span><b>غ</b> غياب مسجل</span>
      <span><b>ت</b> حاضر والعمل متوقف</span><span><b>إ</b> إجازة</span><span><b>—</b> غير مسجل</span>
    </div>
  );

  const manualSignatures = () => (
    <div className="ts-signatures">
      <div><b>مشرف الموقع</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div>
      <div><b>ممثل المقاول</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div>
    </div>
  );

  return (
    <>
      <div className="timesheet-print-toolbar no-print">
        <button type="button" className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
        <span>{title} · {laborClassSummaryLabel(laborClasses)} · {pageModels.length} صفحة</span>
      </div>

      <ConstitutionPagedFrame
        documentKey="timesheet_report"
        cfg={cfg}
        contentTopMm={REPORT_LAYOUT.topMm}
        contentBottomMm={REPORT_LAYOUT.bottomMm}
        contentSideMm={REPORT_LAYOUT.sideMm}
      >
        {pageModels.map((page, pageIndex) => {
          if (page.kind === 'paper') {
            const isLast = pageIndex === pageModels.length - 1;
            const blankRows = isLast ? [{ id:'blank-1' }, { id:'blank-2' }] : [];
            return (
              <div className="ts-page ts-paper-page" key={`paper-${pageIndex}`}>
                {pageTitle(`ورقة ${page.workerPageIndex + 1} من ${page.workerPageCount} · تاريخ الحضور ${displayDate(query.from)}`)}
                <div className="ts-paper-instruction">يضع المشرف علامة ✓ للحضور الكامل أو ½ لنصف اليوم. غير الحاضر يترك بلا علامة، وتكتب الملاحظة عند الحاجة.</div>
                <table className="ts-table ts-paper-table">
                  <colgroup><col className="ts-col-index"/><col className="ts-col-name"/><col className="ts-col-trade"/><col className="ts-col-mark"/><col/></colgroup>
                  <thead><tr><th>م</th><th>اسم العامل</th><th>المهنة</th><th>العلامة</th><th>ملاحظات المشرف</th></tr></thead>
                  <tbody>
                    {[...page.workers, ...blankRows].map((worker, index) => (
                      <tr key={worker.id}><td>{page.workerPageIndex * 18 + index + 1}</td><td>{worker.name || ''}</td><td>{worker.trade || ''}</td><td className="ts-hand-cell"/><td/></tr>
                    ))}
                  </tbody>
                </table>
                <div className="ts-paper-count">عدد الحضور الكامل: ............ · أنصاف الأيام: ............ · مجموع اليوميات: ............</div>
                {manualSignatures()}
              </div>
            );
          }

          if (page.kind === 'detail') {
            const worker = workers[0];
            return (
              <div className="ts-page" key={`detail-${pageIndex}`}>
                {pageTitle(`${worker.name} · ${worker.trade || CLASS_AR[worker.laborClass] || 'عامل'} · ورقة ${page.datePageIndex + 1} من ${page.datePageCount}`)}
                {reportSummary()}
                <table className="ts-table ts-detail-table">
                  <thead><tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>اليومية</th><th>الملاحظات</th></tr></thead>
                  <tbody>
                    {page.dates.map((date) => {
                      const record = attendanceMap[`${worker.id}|${date}`];
                      const status = statusDefinition(record?.status);
                      return (
                        <tr key={date} className={`ts-status-${record?.status || 'unrecorded'}`}>
                          <td className="ltr">{displayDate(date)}</td><td>{arabicDayName(date)}</td>
                          <td><b className="ts-symbol">{status.short}</b> {status.label}</td><td className="ltr">{status.factor}</td>
                          <td>{record?.notes || record?.stop_reason || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {legend()}
              </div>
            );
          }

          const workerIds = new Set(workers.map((worker) => worker.id));
          return (
            <div className="ts-page" key={`matrix-${page.datePageIndex}-${page.workerPageIndex}`}>
              {pageTitle(`${displayDate(page.dates[0])} — ${displayDate(page.dates.at(-1))} · مجموعة العمال ${page.workerPageIndex + 1} من ${page.workerPageCount}`)}
              {reportSummary()}
              <table className="ts-table ts-matrix-table">
                <colgroup><col className="ts-col-index"/><col className="ts-col-name"/><col className="ts-col-trade"/>{page.dates.map((date) => <col key={date} className="ts-col-day"/>)}<col className="ts-col-total"/></colgroup>
                <thead>
                  <tr><th>م</th><th>اسم العامل</th><th>المهنة</th>{page.dates.map((date) => <th key={date}><span>{arabicDayName(date)}</span><small>{displayDate(date).slice(0, 5)}</small></th>)}<th>أيام الفترة</th></tr>
                </thead>
                <tbody>
                  {page.workers.map((worker, index) => (
                    <tr key={worker.id}>
                      <td>{page.workerPageIndex * (dates.length === 1 ? 22 : 16) + index + 1}</td><td className="ts-name-cell">{worker.name}</td><td>{worker.trade || CLASS_AR[worker.laborClass] || 'عامل'}</td>
                      {page.dates.map((date) => {
                        const record = attendanceMap[`${worker.id}|${date}`];
                        const status = statusDefinition(record?.status);
                        return <td key={date} className={`ts-mark ts-status-${record?.status || 'unrecorded'}`} title={status.label}>{status.short}</td>;
                      })}
                      <td className="ts-period-total">{workerPeriodDays(worker.id, attendance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><th colSpan={3}>إجمالي يوميات جميع العمال</th>{page.dates.map((date) => <th key={date}>{workers.reduce((total, worker) => total + statusDefinition(attendanceMap[`${worker.id}|${date}`]?.status).factor, 0)}</th>)}<th>{workers.filter((worker) => workerIds.has(worker.id)).reduce((total, worker) => total + workerPeriodDays(worker.id, attendance), 0)}</th></tr>
                </tfoot>
              </table>
              {legend()}
            </div>
          );
        })}
      </ConstitutionPagedFrame>
    </>
  );
}
