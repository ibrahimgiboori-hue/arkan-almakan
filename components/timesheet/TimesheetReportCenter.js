'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateRange, displayDate, isoDate } from '@/lib/timesheet-report.mjs';
import {
  rosterContractorIdsForPeriod,
  selectRosterAssignmentsForPeriod,
} from '@/lib/site-operation-roster.mjs';
import { laborClassSummaryLabel, summarizeLaborClasses } from '@/lib/labor-class-summary.mjs';
import { WORK_ACTION_CONSEQUENCE, WORK_ACTION_KIND, WORK_ACTION_SCOPE } from '@/lib/work-surface-constitution';
import ProgramAction from '@/components/ui/ProgramAction';
import { WorkSelectionDock } from '@/components/ui/WorkSheetKernel';
import styles from '@/app/dashboard/site-operations/reports/page.module.css';

const MODES = Object.freeze({
  contractor:{
    label:'استعراض وطباعة التايم شيت',
    description:'استعرض حضور جميع عمال المقاول خلال يوم أو فترة، ثم افتح التقرير الرسمي للطباعة.',
  },
  paper:{
    label:'طباعة نموذج تايم شيت لمقاول متعاقد',
    description:'نموذج يومي جاهز بأسماء عمال المقاول المسندين للمشروع للتسجيل اليدوي والطباعة.',
  },
  blank:{
    label:'طباعة نموذج فارغ',
    description:'نموذج تايم شيت عام فارغ للطباعة والنسخ الورقي، دون الحاجة إلى مشروع أو مقاول.',
  },
});

const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });
const today = () => isoDate(new Date());

export default function TimesheetReportCenter({ fixedProjectId = '' }) {
  const [projects, setProjects] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [laborers, setLaborers] = useState([]);
  const [projectId, setProjectId] = useState(fixedProjectId || '');
  const [contractorId, setContractorId] = useState('');
  const [mode, setMode] = useState('contractor');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(()=>new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const contractorQuery = supabase.from('contractors').select('id,name_ar,contractor_no,operation_alias').order('name_ar');
      const projectQuery = fixedProjectId
        ? supabase.from('projects').select('id,project_no,name_ar').eq('id', fixedProjectId).maybeSingle()
        : supabase.from('projects').select('id,project_no,name_ar').eq('status','active').order('project_no');
      const [projectResult, contractorResult] = await Promise.all([projectQuery, contractorQuery]);
      if (!alive) return;
      const firstError = projectResult.error || contractorResult.error;
      if (firstError) { setError(`تعذر تحميل بيانات التايم شيت: ${firstError.message}`); return; }
      const projectRows = fixedProjectId
        ? (projectResult.data ? [projectResult.data] : [])
        : (projectResult.data || []);
      setProjects(projectRows);
      setAllContractors(contractorResult.data || []);
      if (fixedProjectId) {
        setProjectId(fixedProjectId);
        return;
      }
      const remembered = typeof window !== 'undefined' ? localStorage.getItem('arkan.site.project') : '';
      if (remembered && projectRows.some((project) => project.id === remembered)) setProjectId(remembered);
      else if (projectRows.length === 1) setProjectId(projectRows[0].id);
    })();
    return () => { alive = false; };
  }, [fixedProjectId]);

  useEffect(() => {
    setContractorId('');
    setAssignments([]);
    setLaborers([]);
    if (!projectId) return;
    if (!fixedProjectId && typeof window !== 'undefined') localStorage.setItem('arkan.site.project', projectId);
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      const assignmentQuery = await supabase.from('labor_project_assignments')
        .select('id,laborer_id,contractor_id,valid_from,valid_to,labor_class,trade,is_active')
        .eq('project_id',projectId).order('valid_from');
      if (!alive) return;
      if (assignmentQuery.error) { setError(`تعذر تحميل عمال المشروع: ${assignmentQuery.error.message}`); setLoading(false); return; }
      const assignmentRows = assignmentQuery.data || [];
      const ids = [...new Set(assignmentRows.map((row)=>row.laborer_id).filter(Boolean))];
      let laborerRows = [];
      if (ids.length) {
        const laborerQuery = await supabase.from('laborers').select('id,full_name,labor_class,trade,group_code,is_active').in('id',ids).order('full_name');
        if (laborerQuery.error) { setError(`تعذر تحميل أسماء العمال: ${laborerQuery.error.message}`); setLoading(false); return; }
        laborerRows = laborerQuery.data || [];
      }
      setAssignments(assignmentRows); setLaborers(laborerRows); setLoading(false);
    })();
    return () => { alive = false; };
  }, [projectId, fixedProjectId]);

  const rangeTo = mode === 'paper' ? from : to;
  const contractorIds = useMemo(
    () => rosterContractorIdsForPeriod(assignments, from, rangeTo),
    [assignments, from, rangeTo],
  );
  const contractors = useMemo(
    () => allContractors.filter((row)=>contractorIds.includes(row.id)).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar)),
    [allContractors,contractorIds],
  );

  useEffect(() => {
    if (contractorId && !contractors.some((row) => row.id === contractorId)) setContractorId('');
  }, [contractorId, contractors]);

  useEffect(()=>{setSelectedWorkerIds(new Set());},[projectId,contractorId,from,rangeTo,mode]);

  const roster = useMemo(()=>{
    if (!contractorId || !from || !rangeTo || rangeTo < from) return [];
    const relevant = selectRosterAssignmentsForPeriod(assignments, from, rangeTo, { contractorId });
    const laborerById = Object.fromEntries(laborers.map((row)=>[row.id,row]));
    return relevant.map((assignment)=>{ const worker=laborerById[assignment.laborer_id]||{}; return {id:assignment.laborer_id,name:worker.full_name||'—',trade:assignment.trade||worker.trade||'',laborClass:assignment.labor_class||worker.labor_class||'',from:assignment.valid_from,to:assignment.valid_to}; }).sort((a,b)=>naturalCompare(a.name,b.name));
  },[assignments,laborers,contractorId,from,rangeTo]);

  const contractor = contractors.find((row)=>row.id===contractorId);
  const selectedProject = projects.find((row)=>row.id===projectId);
  const rosterClasses = useMemo(()=>summarizeLaborClasses(roster),[roster]);
  const selectedWorkers=useMemo(()=>roster.filter(worker=>selectedWorkerIds.has(String(worker.id))),[roster,selectedWorkerIds]);
  const selectedClasses=useMemo(()=>summarizeLaborClasses(selectedWorkers),[selectedWorkers]);
  const allRosterSelected=roster.length>0&&roster.every(worker=>selectedWorkerIds.has(String(worker.id)));
  const someRosterSelected=!allRosterSelected&&roster.some(worker=>selectedWorkerIds.has(String(worker.id)));

  function changeMode(nextMode) {
    setMode(nextMode); setError('');
    if (nextMode === 'paper') setTo(from);
  }

  function validateReportScope(){
    setError('');
    if (!projectId) {setError('اختر المشروع أولًا.');return false;}
    if (!contractorId) {setError('اختر المقاول.');return false;}
    if (!from || !rangeTo || rangeTo < from) {setError('راجع تاريخ البداية والنهاية.');return false;}
    if (!dateRange(from,rangeTo).length) {setError('الفترة يجب أن تكون صحيحة وألا تتجاوز 370 يومًا في التقرير الواحد.');return false;}
    if (!roster.length) {setError('لا توجد عمالة مسندة لهذا المقاول في التاريخ أو الفترة المختارة.');return false;}
    return true;
  }

  function openReport() {
    setError('');
    if (mode === 'blank') { window.open('/print/timesheet/blank','_blank','noopener,noreferrer'); return; }
    if (!validateReportScope()) return;
    const params = new URLSearchParams({mode:mode==='paper'?'paper':'contractor',project:projectId,contractor:contractorId,from,to:rangeTo});
    window.open(`/print/timesheet?${params.toString()}`,'_blank','noopener,noreferrer');
  }

  function openSelectedReport(){
    if(!selectedWorkerIds.size||!validateReportScope())return;
    const params=new URLSearchParams({
      mode:mode==='paper'?'paper':'worker',
      project:projectId,contractor:contractorId,from,to:rangeTo,
      workers:Array.from(selectedWorkerIds).join(','),
    });
    window.open(`/print/timesheet?${params.toString()}`,'_blank','noopener,noreferrer');
  }

  function toggleWorker(id){
    setSelectedWorkerIds(current=>{const next=new Set(current);const key=String(id);if(next.has(key))next.delete(key);else next.add(key);return next;});
  }
  function toggleRoster(){
    setSelectedWorkerIds(current=>{const next=new Set(current);const ids=roster.map(worker=>String(worker.id));const all=ids.length>0&&ids.every(id=>next.has(id));ids.forEach(id=>all?next.delete(id):next.add(id));return next;});
  }

  return (
    <div dir="rtl" className={styles.root}>
      <div className="page-head">
        <div>
          <h1>تقارير التايم شيت</h1>
          <p>{fixedProjectId ? 'راجع الحضور المسجل لهذا المشروع ثم اختر الفترة والمقاول والمخرج المطلوب.' : 'اختر نوع المخرج المطلوب مباشرة، ثم حدد المشروع والمقاول والفترة عند الحاجة.'}</p>
        </div>
        {!fixedProjectId && <Link className="btn ghost" href="/dashboard/projects">فتح المشاريع</Link>}
      </div>

      <section className={styles.modeGrid} aria-label="نوع المخرج">
        {Object.entries(MODES).map(([key,value])=><button type="button" key={key} className={`${styles.modeCard} ${mode===key?styles.active:''}`} onClick={()=>changeMode(key)}><b>{value.label}</b><span>{value.description}</span></button>)}
      </section>

      <section className={styles.builder}>
        <header><div><h2>{MODES[mode].label}</h2><span>{mode==='contractor'?'التقرير يعرض الحضور واليوميات، مع فصل يوميات الصنايعية عن يوميات العمال.':mode==='paper'?'النموذج مخصص للتسجيل اليدوي لمقاول مرتبط بالمشروع.':'نموذج عام مستقل عن بيانات المشاريع.'}</span></div>{selectedProject&&mode!=='blank'&&<small>{selectedProject.project_no} — {selectedProject.name_ar}</small>}</header>

        {mode !== 'blank' && <>
          <div className={styles.fields}>
            {!fixedProjectId && <div className="field"><label>المشروع</label><select value={projectId} onChange={(event)=>setProjectId(event.target.value)}><option value="">— اختر المشروع —</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.project_no} — {project.name_ar}</option>)}</select></div>}
            <div className="field"><label>المقاول</label><select value={contractorId} onChange={(event)=>setContractorId(event.target.value)} disabled={!projectId||loading}><option value="">— اختر المقاول —</option>{contractors.map((row)=><option key={row.id} value={row.id}>{row.operation_alias||row.name_ar}</option>)}</select></div>
            <div className="field"><label>{mode==='paper'?'تاريخ النموذج':'من'}</label><input type="date" value={from} onChange={(event)=>{setFrom(event.target.value);if(mode==='paper')setTo(event.target.value);}} /></div>
            {mode==='contractor'&&<div className="field"><label>إلى</label><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></div>}
          </div>

          {mode==='contractor'&&<div className={styles.quickDates}><span>اختيار سريع:</span><button type="button" onClick={()=>{const value=today();setFrom(value);setTo(value);}}>اليوم فقط</button><button type="button" onClick={()=>{const value=today();const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()-6);setFrom(isoDate(date));setTo(value);}}>آخر 7 أيام</button><button type="button" onClick={()=>{const value=today();const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()-29);setFrom(isoDate(date));setTo(value);}}>آخر 30 يومًا</button></div>}

          {contractorId&&<div className={styles.rosterSummary}><div><b>{contractor?.operation_alias||contractor?.name_ar}</b><span>{rosterClasses.total} فردًا: {laborClassSummaryLabel(rosterClasses)}</span></div></div>}

          {contractorId&&roster.length>0&&<div data-selection-surface="true" style={{border:'1px solid var(--line,#ddd)',borderRadius:8,overflow:'hidden'}}>
            <label style={{display:'flex',gap:10,alignItems:'center',padding:'9px 12px',borderBottom:'1px solid var(--line,#ddd)',fontWeight:700}}>
              <input type="checkbox" checked={allRosterSelected} ref={node=>{if(node)node.indeterminate=someRosterSelected;}} onChange={toggleRoster}/>
              تحديد العمال الظاهرين ({roster.length})
            </label>
            <div style={{maxHeight:260,overflow:'auto'}}>{roster.map(worker=>{const selected=selectedWorkerIds.has(String(worker.id));return <label key={worker.id} data-record-row="true" data-record-selected={selected?'true':'false'} style={{display:'grid',gridTemplateColumns:'24px minmax(160px,1fr) minmax(100px,.6fr)',gap:8,alignItems:'center',padding:'8px 12px',borderBottom:'1px solid var(--line,#eee)',cursor:'pointer'}}>
              <input type="checkbox" checked={selected} onChange={()=>toggleWorker(worker.id)}/>
              <strong>{worker.name}</strong>
              <span>{worker.trade||worker.laborClass||'—'}</span>
            </label>;})}</div>
          </div>}

          <WorkSelectionDock count={selectedWorkerIds.size} summary={`${selectedClasses.total} فردًا: ${laborClassSummaryLabel(selectedClasses)}`} onClear={()=>setSelectedWorkerIds(new Set())}>
            <ProgramAction className="btn" selectionCount={selectedWorkerIds.size} action={{key:'timesheet.print-selected-workers',label:'طباعة المحدد',kind:WORK_ACTION_KIND.PRINT,actionScope:WORK_ACTION_SCOPE.SELECTION,consequence:WORK_ACTION_CONSEQUENCE.SAFE}} onClick={openSelectedReport}>{mode==='paper'?'طباعة نموذج للمحدد':'فتح وطباعة المحدد'}</ProgramAction>
          </WorkSelectionDock>

          {mode==='paper'&&contractorId&&roster.length>0&&<div className={styles.paperNote}>يمكنك طباعة كل العمال أو تحديد بعضهم فقط. النموذج الكامل يحتوي {rosterClasses.total} فردًا ({laborClassSummaryLabel(rosterClasses)}) في {displayDate(from)}.</div>}
        </>}

        {mode==='blank'&&<div className={styles.paperNote}>هذا النموذج لا يعتمد على مشروع أو مقاول أو تاريخ، ويمكن طباعته ونسخه للاستخدام الميداني.</div>}
        {error&&<div className="msg err">{error}</div>}
        <div className={styles.actions}><button type="button" className="btn" onClick={openReport} disabled={loading}>{mode==='contractor'?'فتح التايم شيت كاملًا وطباعته':mode==='paper'?'فتح نموذج المقاول كاملًا وطباعته':'فتح النموذج الفارغ'}</button>{mode!=='blank'&&<span>✓ يوم كامل · ½ نصف يوم · غ غياب</span>}</div>
      </section>
    </div>
  );
}
