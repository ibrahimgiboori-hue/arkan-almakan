'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
    const proposalQ = await supabase.from('hr_attendance_calibration_proposals')
      .select('*').eq('import_id',activeImport.id).order('weekday');
    if (proposalQ.error) { setErr(proposalQ.error.message); return; }
    setRows(proposalQ.data || []);

    const external = activeImport.processing_scope === 'external';
    let scheduleQ;
    if (external) {
      scheduleQ = await supabase.from('hr_attendance_external_schedules')
        .select('id,external_person_id,valid_from,updated_at')
        .eq('import_id',activeImport.id).eq('is_active',true)
        .order('valid_from',{ascending:false}).order('updated_at',{ascending:false});
    } else {
      const ids=employees.map((e)=>e.id).filter(Boolean);
      if (!ids.length) { setApproved(new Map()); return; }
      scheduleQ = await supabase.from('hr_employee_work_schedules')
        .select('id,employee_id,valid_from,updated_at')
        .in('employee_id',ids).eq('is_active',true)
        .order('valid_from',{ascending:false}).order('updated_at',{ascending:false});
    }
    if (scheduleQ.error) { setErr(scheduleQ.error.message); return; }

    const latest=new Map();
    for (const s of scheduleQ.data || []) {
      const key=external?s.external_person_id:s.employee_id;
      if (key && !latest.has(key)) latest.set(key,s);
    }
    const scheduleIds=[...latest.values()].map((s)=>s.id);
    if (!scheduleIds.length) { setApproved(new Map()); return; }

    const dayTable=external?'hr_attendance_external_schedule_days':'hr_employee_work_schedule_days';
    const dayQ=await supabase.from(dayTable).select('schedule_id,weekday,is_workday,start_time,end_time').in('schedule_id',scheduleIds).order('weekday');
    if (dayQ.error) { setErr(dayQ.error.message); return; }
    const bySchedule=new Map();
    for (const d of dayQ.data || []) {
      if(!bySchedule.has(d.schedule_id)) bySchedule.set(d.schedule_id,[]);
      bySchedule.get(d.schedule_id).push(d);
    }
    const map=new Map();
    for (const [key,s] of latest.entries()) map.set(key,{patterns:uniquePatterns(bySchedule.get(s.id)||[]),scheduleId:s.id});
    setApproved(map);
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
    let q;
    if(kind==='calibrate') q=await supabase.rpc('hr_calibrate_attendance_import',{p_import_id:activeImport.id,p_snap_minutes:60});
    if(kind==='apply') q=await supabase.rpc('hr_apply_attendance_calibration',{p_import_id:activeImport.id,p_min_confidence:'medium'});
    if(kind==='analyze') q=await supabase.rpc('hr_analyze_attendance_import',{p_import_id:activeImport.id});
    setBusy(false);
    if(q?.error){setErr(q.error.message);return;}
    if(kind==='calibrate')setMsg('تم استخراج ساعات الدوام المقترحة.');
    if(kind==='apply')setMsg('تم اعتماد ساعات الدوام الواضحة.');
    if(kind==='analyze')setMsg('تم تحليل الحضور.');
    await onRefresh?.();
    await load();
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
        </tr>)}</tbody>
      </table></div>}
    </div>
  </div>;
}
