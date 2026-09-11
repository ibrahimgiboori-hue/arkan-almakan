'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  analyzeAttendanceImport,
  applyAttendanceCalibration,
  calibrateAttendanceImport,
  loadAttendanceCalibrationSnapshot,
} from '@/lib/adapters/attendance-lab-supabase';

const CONF_AR = { high:'عالية', medium:'متوسطة', low:'منخفضة', insufficient:'غير كافية', off:'—' };

function shortTime(value){
  return value ? String(value).slice(0,5) : '';
}

function uniquePatterns(days=[]){
  return [...new Set(days
    .filter((d)=>d.is_workday && d.start_time && d.end_time)
    .map((d)=>`${shortTime(d.start_time)}–${shortTime(d.end_time)}`))];
}

export default function AttendanceCalibrationPanel({ activeImport, employees = [], externalPeople = [], onRefresh }) {
  const [rows,setRows] = useState([]);
  const [approved,setApproved] = useState(new Map());
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  async function load() {
    if (!activeImport?.id) { setRows([]); setApproved(new Map()); return; }
    setErr('');
    try{
      const snapshot=await loadAttendanceCalibrationSnapshot({
        importId:activeImport.id,
        processingScope:activeImport.processing_scope,
        employeeIds:employees.map((e)=>e.id).filter(Boolean),
      });
      setRows(snapshot.proposals || []);

      const external = activeImport.processing_scope === 'external';
      const latest=new Map();
      for (const schedule of snapshot.schedules || []) {
        const key=external?schedule.external_person_id:schedule.employee_id;
        if (key && !latest.has(key)) latest.set(key,schedule);
      }
      const bySchedule=new Map();
      for (const day of snapshot.scheduleDays || []) {
        if(!bySchedule.has(day.schedule_id)) bySchedule.set(day.schedule_id,[]);
        bySchedule.get(day.schedule_id).push(day);
      }
      const map=new Map();
      for (const [key,schedule] of latest.entries()) {
        map.set(key,{patterns:uniquePatterns(bySchedule.get(schedule.id)||[]),scheduleId:schedule.id});
      }
      setApproved(map);
    }catch(error){
      setErr(error.message||String(error));
      setRows([]);
      setApproved(new Map());
    }
  }

  useEffect(()=>{ load(); },[activeImport]);

  const summary = useMemo(()=>{
    const people = new Map();
    employees.forEach((e)=>people.set(e.id,{no:e.employee_no||'',name:e.full_name_ar||''}));
    externalPeople.forEach((e)=>people.set(e.id,{no:e.external_employee_no||'',name:e.external_employee_name||''}));
    const rank={high:3,medium:2,low:1,insufficient:0};
    const groups=new Map();
    rows.forEach((r)=>{
      const id=r.external_person_id||r.employee_id;
      if(!id)return;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(r);
    });
    const ids=new Set([...groups.keys(),...approved.keys()]);
    return [...ids].map((id)=>{
      const group=groups.get(id)||[];
      const work=group.filter((r)=>r.is_workday);
      const proposed=[...new Set(work.filter((r)=>r.proposed_start&&r.proposed_end).map((r)=>`${shortTime(r.proposed_start)}–${shortTime(r.proposed_end)}`))];
      const confidence=work.length?work.reduce((a,r)=>(rank[r.confidence]??0)<(rank[a]??0)?r.confidence:a,work[0].confidence||'insufficient'):'insufficient';
      const candidate=Math.max(0,...work.map((r)=>Number(r.candidate_days||0)));
      const current=approved.get(id);
      return {
        id,
        ...(people.get(id)||{}),
        patterns:current?.patterns?.length?current.patterns:proposed,
        confidence,
        candidate,
        isApproved:!!current,
      };
    }).sort((a,b)=>String(a.no||a.name).localeCompare(String(b.no||b.name),'ar',{numeric:true,sensitivity:'base'}));
  },[rows,employees,externalPeople,approved]);

  async function act(kind) {
    if(!activeImport?.id)return;
    setBusy(true);setErr('');setMsg('');
    try{
      if(kind==='calibrate')await calibrateAttendanceImport(activeImport.id,{snapMinutes:60});
      if(kind==='apply')await applyAttendanceCalibration(activeImport.id,{minConfidence:'medium'});
      if(kind==='analyze')await analyzeAttendanceImport(activeImport.id);
      if(kind==='calibrate')setMsg('تم استخراج ساعات الدوام المقترحة.');
      if(kind==='apply')setMsg('تم اعتماد ساعات الدوام الواضحة.');
      if(kind==='analyze')setMsg('تم تحليل الحضور.');
      await onRefresh?.();
      await load();
    }catch(error){
      setErr(error.message||String(error));
    }
    setBusy(false);
  }

  if(!activeImport || ['posted','closed'].includes(activeImport.status))return null;

  return <div className="section">
    <header><h2>ساعات الدوام</h2></header>
    <div style={{padding:18}}>
      {err&&<div className="msg err">{err}</div>}{msg&&<div className="msg ok">{msg}</div>}
      <div className="rowsplit" style={{marginBottom:14,gap:8,flexWrap:'wrap',justifyContent:'flex-start'}}>
        {activeImport.status==='parsed'&&<button className="btn" disabled={busy} onClick={()=>act('calibrate')}>استخراج ساعات الدوام</button>}
        {activeImport.status==='calibrated'&&<>
          <button className="btn" disabled={busy} onClick={()=>act('apply')}>اعتماد المقترح</button>
          <button className="btn ghost" disabled={busy} onClick={()=>act('analyze')}>تحليل الحضور</button>
        </>}
        {['calibrated','analyzed','recalculated','ready_to_post'].includes(activeImport.status)&&<button className="btn ghost" disabled={busy} onClick={()=>act('calibrate')}>إعادة الاستخراج</button>}
      </div>

      {summary.length>0&&<div style={{overflowX:'auto'}}><table>
        <thead><tr><th>الموظف</th><th>ساعات الدوام</th><th>أيام العينة</th><th>الثقة</th><th>الحالة</th></tr></thead>
        <tbody>{summary.map((r)=><tr key={r.id}>
          <td>{r.no?`${r.no} - `:''}{r.name||'غير معروف'}</td>
          <td>{r.patterns.length?r.patterns.join('، '):'—'}</td>
          <td>{r.candidate}</td>
          <td>{r.isApproved?'—':(CONF_AR[r.confidence]||r.confidence)}</td>
          <td><strong>{r.isApproved?'معتمد':'مقترح'}</strong></td>
        </tr>)}</tbody></table></div>}
    </div>
  </div>;
}
