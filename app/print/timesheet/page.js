'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { laborClassSummaryLabel, summarizeLaborClasses } from '@/lib/labor-class-summary.mjs';
import { selectRosterAssignmentsForPeriod } from '@/lib/site-operation-roster.mjs';
import ConstitutionPagedFrame from '@/components/print/ConstitutionPagedFrame';
import { getPrintLayoutPolicy, paginateRows } from '@/lib/print-governance';
import {
  arabicDayName,
  buildAttendanceMap,
  chunk,
  dateRange,
  displayDate,
  statusDefinition,
  summarizeAttendance,
  summarizeWorkdaysByLaborClass,
  workerPeriodDays,
} from '@/lib/timesheet-report.mjs';
import './timesheet-report.css';

const REPORT_LAYOUT = getPrintLayoutPolicy('timesheet_report');
const PAGINATION = REPORT_LAYOUT.pagination;
const MATRIX_CAPS = PAGINATION.matrix;
const DETAIL_CAPS = PAGINATION.detail;
const PAPER_CAPS = PAGINATION.paper;
const SUMMARY_CAPS = PAGINATION.summary;
const VALID_MODES = new Set(['worker', 'contractor', 'paper']);
const CLASS_AR = Object.freeze({ worker:'عامل', technician:'صنايعي', foreman:'فورمان' });
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });
const workdayNumber = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits:1 });

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
    setQuery({
      mode:VALID_MODES.has(mode) ? mode : 'contractor',
      projectId:params.get('project') || '',
      contractorId:params.get('contractor') || '',
      from:params.get('from') || '',
      to:params.get('to') || params.get('from') || '',
      workerIds:(params.get('workers') || '').split(',').filter(Boolean),
    });
  }, []);

  useEffect(() => {
    if (!query) return;
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      if (!query.projectId || !query.contractorId || !query.from || !query.to || query.to < query.from) {
        setError('بيانات التقرير غير مكتملة. ارجع إلى مركز التايم شيت وأعد الاختيار.'); setLoading(false); return;
      }
      const [settingsQuery, projectQuery, contractorQuery, assignmentQuery] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
        supabase.from('projects').select('id,project_no,name_ar,city,site_address').eq('id',query.projectId).maybeSingle(),
        supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias').eq('id',query.contractorId).maybeSingle(),
        supabase.from('labor_project_assignments').select('id,laborer_id,contractor_id,valid_from,valid_to,labor_class,trade').eq('project_id',query.projectId).eq('contractor_id',query.contractorId).lte('valid_from',query.to).or(`valid_to.is.null,valid_to.gte.${query.from}`),
      ]);
      const firstError = settingsQuery.error || projectQuery.error || contractorQuery.error || assignmentQuery.error;
      if (!alive) return;
      if (firstError) { setError(`تعذر تحميل التقرير: ${firstError.message}`); setLoading(false); return; }

      let attendanceQuery = supabase.from('v_day_attendance')
        .select('attendance_id,laborer_id,laborer_name,labor_class,trade,contractor_id,work_date,status,stop_reason,notes,is_holiday,weather_stop')
        .eq('project_id',query.projectId).eq('contractor_id',query.contractorId).gte('work_date',query.from).lte('work_date',query.to).order('work_date');
      if (query.mode === 'worker' && query.workerIds.length) attendanceQuery = attendanceQuery.in('laborer_id',query.workerIds);
      const attendanceResult = await attendanceQuery;
      if (!alive) return;
      if (attendanceResult.error) { setError(`تعذر تحميل سجلات الحضور: ${attendanceResult.error.message}`); setLoading(false); return; }

      const attendanceRows = attendanceResult.data || [];
      let assignmentRows = selectRosterAssignmentsForPeriod(
        assignmentQuery.data || [],
        query.from,
        query.to,
        { contractorId:query.contractorId },
      );
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
        const laborerResult = await supabase.from('laborers').select('id,full_name,labor_class,trade,group_code').in('id',laborerIds);
        if (!alive) return;
        if (laborerResult.error) { setError(`تعذر تحميل أسماء العمال: ${laborerResult.error.message}`); setLoading(false); return; }
        laborerRows = laborerResult.data || [];
      }

      const laborerById = Object.fromEntries(laborerRows.map((row) => [row.id,row]));
      const attendanceByWorker = new Map();
      attendanceRows.forEach((row) => { if (!attendanceByWorker.has(row.laborer_id)) attendanceByWorker.set(row.laborer_id,row); });
      const assignmentByWorker = new Map(assignmentRows.map((row) => [row.laborer_id,row]));
      let ids = [...new Set([...assignmentByWorker.keys(),...attendanceByWorker.keys()])];
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
      }).sort((a,b) => naturalCompare(a.name,b.name));

      setCfg(settingsQuery.data); setProject(projectQuery.data); setContractor(contractorQuery.data);
      setWorkers(workerRows); setAttendance(attendanceRows); setLoading(false);
    })();
    return () => { alive = false; };
  }, [query]);

  const dates = useMemo(() => query ? dateRange(query.from,query.to) : [], [query]);
  const attendanceMap = useMemo(() => buildAttendanceMap(attendance), [attendance]);
  const summary = useMemo(() => summarizeAttendance(attendance,workers.map((worker) => worker.id)), [attendance,workers]);
  const laborClasses = useMemo(() => summarizeLaborClasses(workers), [workers]);
  const laborClassByWorker = useMemo(() => Object.fromEntries(workers.map((worker) => [worker.id,worker.laborClass])), [workers]);
  const workdaysByClass = useMemo(() => summarizeWorkdaysByLaborClass(attendance,laborClassByWorker), [attendance,laborClassByWorker]);

  if (loading || !query) return <div className="timesheet-print-loading">جارٍ إعداد التقرير…</div>;
  if (error) return <div className="timesheet-print-loading error">{error}</div>;
  if (!cfg || !project || !contractor) return <div className="timesheet-print-loading error">لم تكتمل بيانات التقرير.</div>;

  const title = reportTitle(query.mode,workers,query.from,query.to);
  const matrixDatePages = chunk(dates,7);
  const matrixFirstDateWorkerPages = paginateRows(workers,MATRIX_CAPS);
  const matrixRegularWorkerPages = paginateRows(workers,{regular:MATRIX_CAPS.regular});
  const detailDatePages = paginateRows(dates,DETAIL_CAPS);
  const paperWorkerPages = paginateRows(workers,PAPER_CAPS);
  const summaryPages = paginateRows(workers,SUMMARY_CAPS);
  const pageModels = [];

  if (query.mode === 'paper') {
    let startIndex = 0;
    paperWorkerPages.forEach((workerPage,workerPageIndex) => {
      pageModels.push({kind:'paper',workers:workerPage,workerPageIndex,workerPageCount:paperWorkerPages.length,startIndex});
      startIndex += workerPage.length;
    });
  } else if (query.mode === 'worker' && workers.length === 1) {
    detailDatePages.forEach((datePage,datePageIndex) => pageModels.push({kind:'detail',dates:datePage,datePageIndex,datePageCount:detailDatePages.length}));
  } else {
    const matrixPageTotal = matrixDatePages.reduce((total,_,datePageIndex) => total + (datePageIndex === 0 ? matrixFirstDateWorkerPages.length : matrixRegularWorkerPages.length), 0);
    let attendancePageNumber = 0;
    matrixDatePages.forEach((datePage,datePageIndex) => {
      const workerPages = datePageIndex === 0 ? matrixFirstDateWorkerPages : matrixRegularWorkerPages;
      let startIndex = 0;
      workerPages.forEach((workerPage,workerPageIndex) => {
        attendancePageNumber += 1;
        pageModels.push({
          kind:'matrix', dates:datePage, workers:workerPage,
          datePageIndex, datePageCount:matrixDatePages.length,
          workerPageIndex, workerPageCount:workerPages.length, startIndex,
          attendancePageNumber, attendancePageCount:matrixPageTotal,
        });
        startIndex += workerPage.length;
      });
    });
    let summaryStartIndex = 0;
    summaryPages.forEach((workerPage,summaryPageIndex) => {
      pageModels.push({kind:'summary',workers:workerPage,summaryPageIndex,summaryPageCount:summaryPages.length,startIndex:summaryStartIndex});
      summaryStartIndex += workerPage.length;
    });
  }

  const fullHeader = (subline='') => <>
    <div className="ts-doc-meta"><span>{cfg.company_name_ar}</span><span>{displayDate(new Date())}</span></div>
    <div className="ts-doc-title"><h1>{title}</h1><span /></div>
    <table className="ts-info-table"><tbody>
      <tr><th>المشروع</th><td>{project.project_no} — {project.name_ar}</td><th>المقاول</th><td>{contractor.name_ar}</td></tr>
      <tr><th>الموقع</th><td>{project.site_address || project.city || '—'}</td><th>الفترة</th><td className="ltr">{periodLabel(query.from,query.to)}</td></tr>
    </tbody></table>
    {subline && <div className="ts-page-subline">{subline}</div>}
  </>;

  const compactHeader = (subline='') => <>
    <div className="ts-doc-meta"><span>{project.project_no} — {project.name_ar}</span><span>{contractor.name_ar}</span></div>
    <div className="ts-page-subline">{periodLabel(query.from,query.to)}{subline ? ` · ${subline}` : ''}</div>
  </>;

  const legend = () => <div className="ts-legend"><span><b>✓</b> يوم كامل</span><span><b>½</b> نصف يوم</span><span><b>غ</b> غياب</span></div>;
  const manualSignatures = () => <div className="ts-signatures"><div><b>مشرف الموقع</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div><div><b>ممثل المقاول</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div></div>;

  return <>
    <div className="timesheet-print-toolbar no-print"><button type="button" className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button><span>{title} · {pageModels.length} صفحة</span></div>
    <ConstitutionPagedFrame documentKey="timesheet_report" cfg={cfg} contentTopMm={REPORT_LAYOUT.topMm} contentBottomMm={REPORT_LAYOUT.bottomMm} contentSideMm={REPORT_LAYOUT.sideMm}>
      {pageModels.map((page,pageIndex) => {
        if (page.kind === 'paper') {
          const isLast = pageIndex === pageModels.length - 1;
          const blankRows = isLast ? [{id:'blank-1'},{id:'blank-2'}] : [];
          return <div className="ts-page ts-paper-page" key={`paper-${pageIndex}`}>
            {fullHeader(`ورقة ${page.workerPageIndex+1} من ${page.workerPageCount} · تاريخ الحضور ${displayDate(query.from)}`)}
            <div className="ts-paper-instruction">يضع المشرف علامة ✓ للحضور الكامل أو ½ لنصف اليوم. غير الحاضر يترك بلا علامة، وتكتب الملاحظة عند الحاجة.</div>
            <table className="ts-table ts-paper-table"><colgroup><col className="ts-col-index"/><col className="ts-col-name"/><col className="ts-col-trade"/><col className="ts-col-mark"/><col/></colgroup><thead><tr><th>م</th><th>اسم العامل</th><th>المهنة</th><th>العلامة</th><th>ملاحظات المشرف</th></tr></thead><tbody>{[...page.workers,...blankRows].map((worker,index) => <tr key={worker.id}><td>{page.startIndex+index+1}</td><td>{worker.name || ''}</td><td>{worker.trade || CLASS_AR[worker.laborClass] || ''}</td><td className="ts-hand-cell"/><td/></tr>)}</tbody></table>
            <div className="ts-paper-count">الحضور الكامل: ............ · أنصاف الأيام: ............ · يوميات الصنايعية: ............ · يوميات العمال: ............ · الإجمالي: ............</div>
            {manualSignatures()}
          </div>;
        }

        if (page.kind === 'detail') {
          const worker = workers[0];
          return <div className="ts-page" key={`detail-${pageIndex}`}>
            {pageIndex === 0 ? fullHeader(`${worker.name} · ${worker.trade || CLASS_AR[worker.laborClass] || 'عامل'}`) : compactHeader(`${worker.name} · صفحة ${page.datePageIndex+1} من ${page.datePageCount}`)}
            <table className="ts-table ts-detail-table"><thead><tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>اليومية</th><th>الملاحظات</th></tr></thead><tbody>{page.dates.map((date) => { const record=attendanceMap[`${worker.id}|${date}`]; const status=statusDefinition(record?.status); return <tr key={date} className={`ts-status-${record?.status || 'absent'}`}><td className="ltr">{displayDate(date)}</td><td>{arabicDayName(date)}</td><td><b className="ts-symbol">{status.short}</b> {status.label}</td><td className="ltr">{status.factor}</td><td>{record?.notes || record?.stop_reason || '—'}</td></tr>; })}</tbody></table>
            {page.datePageIndex === page.datePageCount-1 && <div className="ts-summary"><span><b>{workdayNumber(workerPeriodDays(worker.id,attendance))}</b> إجمالي يوميات العامل</span></div>}
            {legend()}
          </div>;
        }

        if (page.kind === 'summary') {
          const finalSummaryPage = page.summaryPageIndex === page.summaryPageCount - 1;
          return <div className="ts-page" key={`summary-${page.summaryPageIndex}`}>
            {compactHeader(`ختام التقرير · ملخص الفترة${page.summaryPageCount>1 ? ` · ${page.summaryPageIndex+1} من ${page.summaryPageCount}` : ''}`)}
            <div className="ts-doc-title"><h1>ملخص الفترة</h1><span /></div>
            <table className="ts-table ts-detail-table"><thead><tr><th>م</th><th>اسم العامل</th><th>الصفة</th><th>المهنة</th><th>إجمالي أيام الفترة</th></tr></thead><tbody>{page.workers.map((worker,index) => <tr key={worker.id}><td>{page.startIndex+index+1}</td><td className="ts-name-cell">{worker.name}</td><td>{CLASS_AR[worker.laborClass] || 'غير مصنف'}</td><td>{worker.trade || '—'}</td><td><b>{workdayNumber(workerPeriodDays(worker.id,attendance))}</b></td></tr>)}</tbody></table>
            {finalSummaryPage && <>
              <div className="ts-summary" style={{marginTop:12}}>
                <span><b>{laborClasses.total}</b> عدد الأفراد</span>
                <span><b>{summary.full}</b> حضور كامل</span>
                <span><b>{summary.half}</b> نصف يوم</span>
                <span><b>{workdayNumber(workdaysByClass.technician)}</b> يوميات الصنايعية</span>
                <span><b>{workdayNumber(workdaysByClass.worker)}</b> يوميات العمال</span>
                {workdaysByClass.foreman>0 && <span><b>{workdayNumber(workdaysByClass.foreman)}</b> يوميات الفورمان</span>}
                {workdaysByClass.other>0 && <span><b>{workdayNumber(workdaysByClass.other)}</b> يوميات غير مصنفة</span>}
                <span><b>{workdayNumber(workdaysByClass.total)}</b> إجمالي اليوميات</span>
              </div>
              {legend()}
            </>}
          </div>;
        }

        return <div className="ts-page" key={`matrix-${page.datePageIndex}-${page.workerPageIndex}`}>
          {page.attendancePageNumber === 1
            ? fullHeader(`الحضور · ${displayDate(page.dates[0])} — ${displayDate(page.dates.at(-1))} · صفحة ${page.attendancePageNumber} من ${page.attendancePageCount}`)
            : compactHeader(`الحضور · ${displayDate(page.dates[0])} — ${displayDate(page.dates.at(-1))} · صفحة ${page.attendancePageNumber} من ${page.attendancePageCount}`)}
          <table className="ts-table ts-matrix-table">
            <colgroup><col className="ts-col-index"/><col className="ts-col-name"/><col className="ts-col-trade"/>{page.dates.map((date) => <col key={date} className="ts-col-day"/>)}</colgroup>
            <thead><tr><th>م</th><th>اسم العامل</th><th>الصفة / المهنة</th>{page.dates.map((date) => <th key={date}><span>{arabicDayName(date)}</span><small>{displayDate(date).slice(0,5)}</small></th>)}</tr></thead>
            <tbody>{page.workers.map((worker,index) => <tr key={worker.id}><td>{page.startIndex+index+1}</td><td className="ts-name-cell">{worker.name}</td><td>{CLASS_AR[worker.laborClass] || 'عامل'}{worker.trade ? ` — ${worker.trade}` : ''}</td>{page.dates.map((date) => { const record=attendanceMap[`${worker.id}|${date}`]; const status=statusDefinition(record?.status); return <td key={date} className={`ts-mark ts-status-${record?.status || 'absent'}`} title={status.label}>{status.short}</td>; })}</tr>)}</tbody>
          </table>
          {legend()}
        </div>;
      })}
    </ConstitutionPagedFrame>
  </>;
}
