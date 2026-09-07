'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { selectRosterAssignmentsForPeriod } from '@/lib/site-operation-roster.mjs';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import MonthlyTimesheetSheet, { monthlyTimesheetMonthLabel } from '@/components/timesheet/MonthlyTimesheetSheet';
import { displayDate, statusDefinition, workerPeriodDays } from '@/lib/timesheet-report.mjs';
import './timesheet-report.css';

const CLASS_AR = Object.freeze({ worker:'عامل', technician:'صنايعي', foreman:'فورمان' });
const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });

function monthBounds(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const [yearText,monthText] = period.split('-');
  const year = Number(yearText), month = Number(monthText);
  if (!year || month < 1 || month > 12) return null;
  const last = new Date(year,month,0).getDate();
  return {
    year, month,
    from:`${yearText}-${monthText}-01`,
    to:`${yearText}-${monthText}-${String(last).padStart(2,'0')}`,
  };
}

function assignedOnDate(assignments, laborerId, date) {
  return (assignments || []).some((row) =>
    row.laborer_id === laborerId &&
    row.valid_from <= date &&
    (!row.valid_to || row.valid_to >= date)
  );
}

export default function TimesheetPrintPage() {
  const [query, setQuery] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [project, setProject] = useState(null);
  const [contractor, setContractor] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paperMode = params.get('mode') === 'paper';
    const legacyFrom = params.get('from') || '';
    const period = params.get('month') || legacyFrom.slice(0,7);
    const bounds = monthBounds(period);
    setQuery({
      mode:paperMode ? 'paper' : 'monthly',
      projectId:params.get('project') || '',
      contractorId:params.get('contractor') || '',
      period,
      year:bounds?.year || null,
      month:bounds?.month || null,
      from:paperMode ? legacyFrom : (bounds?.from || ''),
      to:paperMode ? legacyFrom : (bounds?.to || ''),
      workerIds:(params.get('workers') || '').split(',').filter(Boolean),
    });
  }, []);

  useEffect(() => {
    if (!query) return;
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      if (!query.projectId || !query.contractorId || !query.from || !query.to || query.to < query.from) {
        setError('بيانات التقرير غير مكتملة. ارجع إلى مركز تقارير الحضور وأعد الاختيار.'); setLoading(false); return;
      }
      const [settingsQuery, projectQuery, contractorQuery, assignmentQuery] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
        supabase.from('projects').select('id,project_no,name_ar,city,site_address').eq('id',query.projectId).maybeSingle(),
        supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias').eq('id',query.contractorId).maybeSingle(),
        supabase.from('labor_project_assignments')
          .select('id,laborer_id,contractor_id,valid_from,valid_to,labor_class,trade')
          .eq('project_id',query.projectId).eq('contractor_id',query.contractorId)
          .lte('valid_from',query.to).or(`valid_to.is.null,valid_to.gte.${query.from}`),
      ]);
      const firstError = settingsQuery.error || projectQuery.error || contractorQuery.error || assignmentQuery.error;
      if (!alive) return;
      if (firstError) { setError(`تعذر تحميل التقرير: ${firstError.message}`); setLoading(false); return; }

      let attendanceQuery = supabase.from('v_day_attendance')
        .select('attendance_id,laborer_id,laborer_name,labor_class,trade,contractor_id,work_date,status,rate_used,amount,stop_reason,notes,is_holiday,weather_stop')
        .eq('project_id',query.projectId).eq('contractor_id',query.contractorId)
        .gte('work_date',query.from).lte('work_date',query.to).order('work_date');
      if (query.workerIds.length) attendanceQuery = attendanceQuery.in('laborer_id',query.workerIds);
      const attendanceResult = await attendanceQuery;
      if (!alive) return;
      if (attendanceResult.error) { setError(`تعذر تحميل سجلات الحضور: ${attendanceResult.error.message}`); setLoading(false); return; }

      const attendanceRows = attendanceResult.data || [];
      let assignmentRows = selectRosterAssignmentsForPeriod(
        assignmentQuery.data || [], query.from, query.to, { contractorId:query.contractorId },
      );
      if (query.workerIds.length) {
        const wanted = new Set(query.workerIds);
        assignmentRows = assignmentRows.filter((row) => wanted.has(row.laborer_id));
      }
      const laborerIds = [...new Set([
        ...assignmentRows.map((row) => row.laborer_id),
        ...attendanceRows.map((row) => row.laborer_id),
        ...query.workerIds,
      ].filter(Boolean))];
      let laborerRows = [];
      if (laborerIds.length) {
        const laborerResult = await supabase.from('laborers').select('id,full_name,labor_class,trade,group_code').in('id',laborerIds);
        if (!alive) return;
        if (laborerResult.error) { setError(`تعذر تحميل أسماء العمال: ${laborerResult.error.message}`); setLoading(false); return; }
        laborerRows = laborerResult.data || [];
      }

      const laborerById = Object.fromEntries(laborerRows.map((row) => [row.id,row]));
      const historicalByWorker = new Map();
      attendanceRows.forEach((row) => { if (!historicalByWorker.has(row.laborer_id)) historicalByWorker.set(row.laborer_id,row); });
      const assignmentByWorker = new Map();
      assignmentRows.forEach((row)=>{ if(!assignmentByWorker.has(row.laborer_id)) assignmentByWorker.set(row.laborer_id,row); });
      let ids = [...new Set([...assignmentByWorker.keys(),...historicalByWorker.keys()])];
      if (query.workerIds.length) {
        const available = new Set(ids);
        ids = query.workerIds.filter((id) => available.has(id));
      }
      const workerRows = ids.map((id) => {
        const laborer = laborerById[id] || {};
        const assignment = assignmentByWorker.get(id) || {};
        const historical = historicalByWorker.get(id) || {};
        return {
          id,
          name:laborer.full_name || historical.laborer_name || '—',
          trade:assignment.trade || historical.trade || laborer.trade || '',
          laborClass:assignment.labor_class || historical.labor_class || laborer.labor_class || '',
          groupCode:laborer.group_code || '',
        };
      }).sort((a,b) => naturalCompare(a.name,b.name));

      setCfg(settingsQuery.data); setProject(projectQuery.data); setContractor(contractorQuery.data);
      setWorkers(workerRows); setAssignments(assignmentRows); setAttendance(attendanceRows); setLoading(false);
    })();
    return () => { alive = false; };
  }, [query]);

  const attendanceByWorkerDate = useMemo(() => {
    const map = new Map();
    for (const row of attendance) map.set(`${row.laborer_id}|${row.work_date}`,row);
    return map;
  }, [attendance]);

  if (loading || !query) return <div className="timesheet-print-loading">جارٍ إعداد التقرير…</div>;
  if (error) return <div className="timesheet-print-loading error">{error}</div>;
  if (!cfg || !project || !contractor) return <div className="timesheet-print-loading error">لم تكتمل بيانات التقرير.</div>;

  const manualSignatures = () => <div className="ts-signatures"><div><b>مشرف الموقع</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div><div><b>ممثل المقاول</b><span>الاسم: ........................................................</span><span>التاريخ: ......................................................</span><span className="signature-line">التوقيع:</span></div></div>;

  let flowContent;
  let title;

  if (query.mode === 'paper') {
    title = 'نموذج تسجيل حضور يومي';
    const paperRows = [...workers,{id:'blank-1'},{id:'blank-2'}];
    flowContent = <div className="timesheet-flow">
      <div className="ts-doc-meta"><span>{cfg.company_name_ar}</span><span>{displayDate(new Date())}</span></div>
      <div className="ts-doc-title" data-print-keep-with-next="true"><h1>{title}</h1><span /></div>
      <table className="ts-info-table"><tbody>
        <tr><th>المشروع</th><td>{project.project_no} — {project.name_ar}</td><th>المقاول</th><td>{contractor.name_ar}</td></tr>
        <tr><th>الموقع</th><td>{project.site_address || project.city || '—'}</td><th>تاريخ الحضور</th><td className="ltr">{displayDate(query.from)}</td></tr>
      </tbody></table>
      <div className="ts-paper-instruction" data-print-keep-with-next="true">يضع المشرف علامة ✓ للحضور الكامل أو ½ لنصف اليوم. غير الحاضر يترك بلا علامة، وتكتب الملاحظة عند الحاجة.</div>
      <table className="ts-table ts-paper-table" data-print-flow="repeatable-table">
        <colgroup><col className="ts-col-index"/><col className="ts-col-name"/><col className="ts-col-trade"/><col className="ts-col-mark"/><col/></colgroup>
        <thead><tr><th>م</th><th>اسم العامل</th><th>المهنة</th><th>العلامة</th><th>ملاحظات المشرف</th></tr></thead>
        <tbody>{paperRows.map((worker,index) => <tr key={worker.id} data-print-flow-item="row"><td>{index+1}</td><td>{worker.name || ''}</td><td>{worker.trade || CLASS_AR[worker.laborClass] || ''}</td><td className="ts-hand-cell"/><td/></tr>)}</tbody>
      </table>
      <div className="ts-paper-count">الحضور الكامل: ............ · أنصاف الأيام: ............ · يوميات الصنايعية: ............ · يوميات العمال: ............ · الإجمالي: ............</div>
      {manualSignatures()}
    </div>;
  } else {
    title = 'التايم شيت الشهري';
    const monthlyRows = workers.map((worker) => {
      const attendanceValues = {};
      const marks = {};
      for (let day=1; day<=new Date(query.year,query.month,0).getDate(); day += 1) {
        const dayText=String(day).padStart(2,'0');
        const date=`${query.period}-${dayText}`;
        const record=attendanceByWorkerDate.get(`${worker.id}|${date}`);
        if (record) {
          const status=statusDefinition(record.status);
          attendanceValues[String(day)]=status.factor;
          marks[String(day)]=status.short;
        } else if (assignedOnDate(assignments,worker.id,date)) {
          attendanceValues[String(day)]=0;
          marks[String(day)]=statusDefinition('unrecorded').short;
        }
      }
      return {
        id:worker.id,
        name:worker.name,
        identity:[CLASS_AR[worker.laborClass] || 'عامل',worker.trade].filter(Boolean).join(' — '),
        attendance:attendanceValues,
        marks,
        totalDays:workerPeriodDays(worker.id,attendance),
      };
    });
    flowContent = <MonthlyTimesheetSheet
      year={query.year}
      month={query.month}
      reference={project.project_no || ''}
      meta={[
        {label:'المقاول',value:contractor.operation_alias || contractor.name_ar},
        {label:'المشروع',value:project.name_ar},
        {label:'الشهر',value:monthlyTimesheetMonthLabel(query.year,query.month)},
        {label:'الموقع',value:project.site_address || project.city || '—'},
      ]}
      identityLabel="الصفة / المهنة"
      rows={monthlyRows}
    />;
  }

  return <>
    <div className="timesheet-print-toolbar no-print"><button type="button" className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button><span>{title} · الحضور اليومي هو المصدر والمطبوعة الرسمية شهرية</span></div>
    <ConstitutionPrintFrame documentKey="timesheet_report" cfg={cfg}>
      {flowContent}
    </ConstitutionPrintFrame>
  </>;
}
