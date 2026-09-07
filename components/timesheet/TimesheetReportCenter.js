'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { isoDate } from '@/lib/timesheet-report.mjs';
import {
  rosterContractorIdsForPeriod,
  selectRosterAssignmentsForPeriod,
} from '@/lib/site-operation-roster.mjs';
import { laborClassSummaryLabel, summarizeLaborClasses } from '@/lib/labor-class-summary.mjs';
import styles from '@/app/dashboard/site-operations/reports/page.module.css';

const MODES = Object.freeze({
  monthly:{
    label:'التايم شيت الشهري',
    description:'المطبوعة الرسمية تعرض الشهر كاملًا في ورقة أفقية، مهما كان عدد أيام الحضور المسجلة.',
  },
  paper:{
    label:'نموذج تسجيل حضور يومي',
    description:'ورقة مساعدة للموقع لتسجيل حضور يوم محدد يدويًا. ليست تايم شيتًا أسبوعيًا ولا مطبوعة الاستحقاق الشهرية.',
  },
  blank:{
    label:'نموذج حضور فارغ',
    description:'ورقة ميدانية عامة فارغة للطباعة والنسخ، مستقلة عن بيانات المشروع والمقاول.',
  },
});

const naturalCompare = (a = '', b = '') => String(a).localeCompare(String(b), 'ar', { numeric:true, sensitivity:'base' });
const today = () => isoDate(new Date());
const currentMonth = () => today().slice(0,7);

function monthBounds(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return { from:'', to:'' };
  const [yearText,monthText] = period.split('-');
  const year = Number(yearText), month = Number(monthText);
  if (!year || month < 1 || month > 12) return { from:'', to:'' };
  const last = new Date(year,month,0).getDate();
  return { from:`${yearText}-${monthText}-01`, to:`${yearText}-${monthText}-${String(last).padStart(2,'0')}` };
}

export default function TimesheetReportCenter({ fixedProjectId = '' }) {
  const [projects, setProjects] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [laborers, setLaborers] = useState([]);
  const [projectId, setProjectId] = useState(fixedProjectId || '');
  const [contractorId, setContractorId] = useState('');
  const [mode, setMode] = useState('monthly');
  const [period, setPeriod] = useState(currentMonth());
  const [paperDate, setPaperDate] = useState(today());
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
      const projectRows = fixedProjectId ? (projectResult.data ? [projectResult.data] : []) : (projectResult.data || []);
      setProjects(projectRows);
      setAllContractors(contractorResult.data || []);
      if (fixedProjectId) { setProjectId(fixedProjectId); return; }
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

  const monthlyBounds = useMemo(()=>monthBounds(period),[period]);
  const from = mode === 'paper' ? paperDate : monthlyBounds.from;
  const to = mode === 'paper' ? paperDate : monthlyBounds.to;
  const contractorIds = useMemo(
    () => mode === 'blank' ? [] : rosterContractorIdsForPeriod(assignments, from, to),
    [assignments, from, to, mode],
  );
  const contractors = useMemo(
    () => allContractors.filter((row)=>contractorIds.includes(row.id)).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar)),
    [allContractors,contractorIds],
  );

  useEffect(() => {
    if (contractorId && !contractors.some((row) => row.id === contractorId)) setContractorId('');
  }, [contractorId, contractors]);

  useEffect(()=>{setSelectedWorkerIds(new Set());},[projectId,contractorId,from,to,mode]);

  const roster = useMemo(()=>{
    if (!contractorId || !from || !to || to < from) return [];
    const relevant = selectRosterAssignmentsForPeriod(assignments, from, to, { contractorId });
    const laborerById = Object.fromEntries(laborers.map((row)=>[row.id,row]));
    return relevant.map((assignment)=>{
      const worker=laborerById[assignment.laborer_id]||{};
      return {
        id:assignment.laborer_id,
        name:worker.full_name||'—',
        trade:assignment.trade||worker.trade||'',
        laborClass:assignment.labor_class||worker.labor_class||'',
      };
    }).sort((a,b)=>naturalCompare(a.name,b.name));
  },[assignments,laborers,contractorId,from,to]);

  const contractor = contractors.find((row)=>row.id===contractorId);
  const selectedProject = projects.find((row)=>row.id===projectId);
  const rosterClasses = useMemo(()=>summarizeLaborClasses(roster),[roster]);
  const allRosterSelected=roster.length>0&&roster.every(worker=>selectedWorkerIds.has(String(worker.id)));
  const someRosterSelected=!allRosterSelected&&roster.some(worker=>selectedWorkerIds.has(String(worker.id)));

  function validateReportScope(){
    setError('');
    if (!projectId) {setError('اختر المشروع أولًا.');return false;}
    if (!contractorId) {setError('اختر المقاول.');return false;}
    if (!from || !to || to < from) {setError(mode==='monthly'?'اختر شهرًا صحيحًا.':'اختر تاريخًا صحيحًا.');return false;}
    if (!roster.length) {setError('لا توجد عمالة مسندة لهذا المقاول خلال الفترة المختارة.');return false;}
    return true;
  }

  function openReport(selectedOnly=false) {
    setError('');
    if (mode === 'blank') { window.open('/print/timesheet/blank','_blank','noopener,noreferrer'); return; }
    if (!validateReportScope()) return;
    const params = new URLSearchParams({ project:projectId, contractor:contractorId });
    if (mode === 'paper') {
      params.set('mode','paper'); params.set('from',paperDate);
    } else {
      params.set('month',period);
      if (selectedOnly && selectedWorkerIds.size) params.set('workers',Array.from(selectedWorkerIds).join(','));
    }
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
          <h1>تقارير الحضور والتايم شيت</h1>
          <p>الحضور يظل مسجلًا يوميًا، أما التايم شيت الرسمي فيُجمع ويُطبع شهريًا على الورقة الأفقية الموحدة.</p>
        </div>
        {!fixedProjectId && <Link className="btn ghost" href="/dashboard/projects">فتح المشاريع</Link>}
      </div>

      <section className={styles.modeGrid} aria-label="نوع المخرج">
        {Object.entries(MODES).map(([key,value])=><button type="button" key={key} className={`${styles.modeCard} ${mode===key?styles.active:''}`} onClick={()=>{setMode(key);setError('');}}><b>{value.label}</b><span>{value.description}</span></button>)}
      </section>

      <section className={styles.builder}>
        <header>
          <div><h2>{MODES[mode].label}</h2><span>{mode==='monthly'?'الشهر كامل 01–31، حتى لو كان الحضور المسجل يومًا واحدًا فقط.':mode==='paper'?'أداة إدخال ورقية مساعدة للموقع، وليست وحدة أسبوعية.':'نموذج عام مستقل عن بيانات المشاريع.'}</span></div>
          {selectedProject&&mode!=='blank'&&<small>{selectedProject.project_no} — {selectedProject.name_ar}</small>}
        </header>

        {mode !== 'blank' && <>
          <div className={styles.fields}>
            {!fixedProjectId && <div className="field"><label>المشروع</label><select value={projectId} onChange={(event)=>setProjectId(event.target.value)}><option value="">— اختر المشروع —</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.project_no} — {project.name_ar}</option>)}</select></div>}
            <div className="field"><label>المقاول</label><select value={contractorId} onChange={(event)=>setContractorId(event.target.value)} disabled={!projectId||loading}><option value="">— اختر المقاول —</option>{contractors.map((row)=><option key={row.id} value={row.id}>{row.operation_alias||row.name_ar}</option>)}</select></div>
            {mode==='monthly'
              ? <div className="field"><label>الشهر</label><input type="month" value={period} onChange={(event)=>setPeriod(event.target.value)} /></div>
              : <div className="field"><label>تاريخ النموذج</label><input type="date" value={paperDate} onChange={(event)=>setPaperDate(event.target.value)} /></div>}
          </div>

          {contractorId&&<div className={styles.rosterSummary}><div><b>{contractor?.operation_alias||contractor?.name_ar}</b><span>{rosterClasses.total} فردًا خلال {mode==='monthly'?'الشهر':'اليوم'}: {laborClassSummaryLabel(rosterClasses)}</span></div></div>}

          {contractorId&&roster.length>0&&<div className={styles.workerList} data-selection-surface="true">
            {mode==='monthly'&&<label className={allRosterSelected?styles.workerSelected:''}>
              <input type="checkbox" checked={allRosterSelected} ref={node=>{if(node)node.indeterminate=someRosterSelected;}} onChange={toggleRoster}/>
              <span><b>تحديد العمال الظاهرين</b><small>{roster.length} عاملًا/صنايعيًا</small></span>
            </label>}
            {roster.map(worker=>{const selected=selectedWorkerIds.has(String(worker.id));return <label key={worker.id} className={selected?styles.workerSelected:''}>
              {mode==='monthly'?<input type="checkbox" checked={selected} onChange={()=>toggleWorker(worker.id)}/>:null}
              <span><b>{worker.name}</b><small>{worker.trade||worker.laborClass||'عامل'}</small></span>
            </label>;})}
          </div>}
        </>}

        {mode==='blank'&&<div className={styles.paperNote}>هذا نموذج حضور ميداني فارغ فقط. التايم شيت الرسمي داخل البرنامج يظل شهريًا.</div>}
        {error&&<div className="msg err">{error}</div>}
        <div className={styles.actions}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" className="btn" onClick={()=>openReport(false)} disabled={loading}>{mode==='monthly'?'فتح التايم شيت الشهري وطباعته':mode==='paper'?'فتح نموذج الحضور اليومي':'فتح النموذج الفارغ'}</button>
            {mode==='monthly'&&selectedWorkerIds.size>0?<button type="button" className="btn ghost" onClick={()=>openReport(true)}>طباعة المحددين فقط ({selectedWorkerIds.size})</button>:null}
          </div>
          {mode!=='blank'&&<span>✓ يوم كامل · ½ نصف يوم · الغياب والحالات الخاصة تظهر من التسجيل اليومي</span>}
        </div>
      </section>
    </div>
  );
}
