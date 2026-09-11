'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  loadAttendanceManualResolutionQueue,
  loadAttendanceDayPunches,
  resolveAttendanceDayManually,
} from '@/lib/adapters/attendance-manual-resolution-supabase';
import { externalStageHref, getCurrentExternalImportId, setCurrentExternalImportId } from '@/lib/attendance/current-external-import';

const STATUS_LABEL={complete:'مكتمل',missing_in:'دخول مفقود',missing_out:'خروج مفقود',needs_review:'للمراجعة'};

function toInput(value){
  if(!value)return '';
  const s=String(value).trim();const m=s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  return m?`${m[1]}T${m[2]}:${m[3]||'00'}`:'';
}
function fmt(value){
  if(!value)return '—';const s=String(value);const m=s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);return m?`${m[1]} ${m[2]}`:s;
}
function timeOnly(value){
  const s=String(value||'');const m=s.match(/[ T](\d{2}:\d{2}:\d{2})/);return m?.[1]||s||'—';
}
function dateOnly(value){return value?String(value).slice(0,10):'';}
function batchLabel(item){return `${item.processing_scope==='external'?(item.client_name_snapshot||'عميل خارجي'):'أركان المكان'} — ${dateOnly(item.period_from)} إلى ${dateOnly(item.period_to)}`;}

export default function AttendanceManualResolutionPage(){
  const searchParams=useSearchParams();
  const [imports,setImports]=useState([]);
  const [rows,setRows]=useState([]);
  const [activeId,setActiveId]=useState('');
  const [editing,setEditing]=useState(null);
  const [punches,setPunches]=useState([]);
  const [checkIn,setCheckIn]=useState('');
  const [checkOut,setCheckOut]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  async function load(preferred=''){
    setErr('');
    try{
      const result=await loadAttendanceManualResolutionQueue(1200);
      const nextRows=result.rows||[];const list=result.imports||[];
      setRows(nextRows);setImports(list);
      if(!list.length){setActiveId('');return;}
      const urlId=searchParams.get('batch')||'';const remembered=getCurrentExternalImportId();
      setActiveId((current)=>{
        for(const id of [preferred,urlId,current,remembered]){if(id&&list.some((x)=>x.id===id))return id;}
        return list[0]?.id||'';
      });
    }catch(error){setErr(error?.message||String(error));}
  }

  useEffect(()=>{load();},[]);

  const activeImport=useMemo(()=>imports.find((x)=>x.id===activeId)||null,[imports,activeId]);
  const drafts=useMemo(()=>imports.filter((x)=>x.id!==activeId),[imports,activeId]);
  const visibleRows=useMemo(()=>rows.filter((r)=>r.import_id===activeId),[rows,activeId]);

  useEffect(()=>{if(activeId&&activeImport?.processing_scope==='external')setCurrentExternalImportId(activeId);},[activeId,activeImport?.processing_scope]);

  function chooseBatch(id){setActiveId(id);setEditing(null);setMsg('');setErr('');if(imports.find((x)=>x.id===id)?.processing_scope==='external')setCurrentExternalImportId(id);}

  async function openEditor(day){
    setEditing(day);setCheckIn(toInput(day.check_in));setCheckOut(toInput(day.check_out));setNote('');setPunches([]);setErr('');setMsg('');
    try{setPunches(await loadAttendanceDayPunches(day));}catch(error){setErr(error?.message||String(error));}
  }
  function usePunch(value,kind){const normalized=toInput(value);if(kind==='in')setCheckIn(normalized);else setCheckOut(normalized);}
  async function save(){
    if(!editing)return;
    if(!checkIn&&!checkOut){setErr('حدد دخولًا أو خروجًا.');return;}
    if(checkIn&&checkOut&&new Date(checkOut)<=new Date(checkIn)){setErr('الخروج يجب أن يكون بعد الدخول.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const data=await resolveAttendanceDayManually({attendanceDayId:editing.id,checkIn:checkIn||null,checkOut:checkOut||null,note:note.trim()||null});
      const status=data?.day_status||'';setEditing(null);setPunches([]);setMsg(`تم الحفظ — ${STATUS_LABEL[status]||status}.`);await load(activeId);
    }catch(error){setErr(error?.message||String(error));}
    setBusy(false);
  }

  return <div className="page" dir="rtl">
    <div className="page-head"><div><h1>مراجعة الحالات</h1></div><Link className="btn ghost" href={activeImport?.processing_scope==='external'?externalStageHref('/dashboard/attendance/external-review',activeId):'/dashboard/attendance'}>رجوع</Link></div>
    {err&&<div className="msg err" style={{marginTop:12}}>{err}</div>}{msg&&<div className="msg ok" style={{marginTop:12}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}><header><h2>الحالي</h2></header><div style={{padding:18}}>
      {activeImport?<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong style={{fontSize:16}}>{batchLabel(activeImport)}</strong></div><span className="tag">{visibleRows.length} حالة</span></div>:<strong>لا توجد حالات معلقة.</strong>}
      {drafts.length>0&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:700}}>المسودات ({drafts.length})</summary><div style={{display:'grid',gap:8,marginTop:10}}>{drafts.map((item)=><button key={item.id} type="button" className="btn ghost" style={{justifyContent:'space-between',textAlign:'right'}} onClick={()=>chooseBatch(item.id)}><span>{batchLabel(item)}</span><span>{rows.filter((r)=>r.import_id===item.id).length} حالة</span></button>)}</div></details>}
    </div></div>

    {activeImport&&<div className="section"><header><h2>الحالات غير المصنفة</h2></header>
      {!visibleRows.length?<div style={{padding:18,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><strong>لا توجد حالات معلقة.</strong>{activeImport.processing_scope==='external'&&<Link className="btn" href={externalStageHref('/dashboard/attendance/external-review',activeId)}>متابعة المراجعة</Link>}</div>:
      <div style={{overflowX:'auto'}}><table><thead><tr><th>الرقم</th><th>الموظف</th><th>التاريخ</th><th>الدوام</th><th>الدخول</th><th>الخروج</th><th>الحركات</th><th>الإجراء</th></tr></thead><tbody>{visibleRows.map((day)=><tr key={day.id}><td>{day.subject_no||'—'}</td><td><strong>{day.subject_name||'غير معروف'}</strong></td><td>{day.work_date}</td><td>{timeOnly(day.scheduled_start)} — {timeOnly(day.scheduled_end)}</td><td>{timeOnly(day.check_in)}</td><td>{timeOnly(day.check_out)}</td><td>{day.raw_punch_count||0}</td><td><button type="button" className="btn" onClick={()=>openEditor(day)}>مراجعة</button></td></tr>)}</tbody></table></div>}
    </div>}

    {editing&&<div style={{position:'fixed',inset:0,zIndex:80,background:'rgba(15,23,42,.48)',display:'grid',placeItems:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setEditing(null);}}><div className="section" style={{width:'min(900px,96vw)',maxHeight:'92vh',overflow:'auto',background:'#fff',boxShadow:'0 20px 70px rgba(15,23,42,.25)'}}><header><div><h2>{editing.subject_name}</h2><span className="hint">{editing.work_date} · {editing.subject_no||''}</span></div><button type="button" className="btn ghost" disabled={busy} onClick={()=>setEditing(null)}>إغلاق</button></header><div style={{padding:18}}>
      <div className="form-grid"><div className="field"><label>الدخول</label><input type="datetime-local" step="1" value={checkIn} onChange={(e)=>setCheckIn(e.target.value)}/><button type="button" className="btn ghost" style={{marginTop:6}} onClick={()=>setCheckIn('')}>مسح</button></div><div className="field"><label>الخروج</label><input type="datetime-local" step="1" value={checkOut} onChange={(e)=>setCheckOut(e.target.value)}/><button type="button" className="btn ghost" style={{marginTop:6}} onClick={()=>setCheckOut('')}>مسح</button></div></div>
      <div style={{marginTop:18}}><strong>حركات البصمة</strong>{!punches.length?<p className="hint">لا توجد حركات.</p>:<div style={{overflowX:'auto',marginTop:8}}><table><thead><tr><th>الوقت</th><th>المصدر</th><th>اعتماد</th></tr></thead><tbody>{punches.map((p)=><tr key={p.id}><td>{fmt(p.punch_local)}</td><td>{p.source_sheet||'—'}{p.source_row?` · ${p.source_row}`:''}</td><td><div className="rowsplit" style={{gap:6,justifyContent:'flex-start'}}><button type="button" className="btn ghost" onClick={()=>usePunch(p.punch_local,'in')}>دخول</button><button type="button" className="btn ghost" onClick={()=>usePunch(p.punch_local,'out')}>خروج</button></div></td></tr>)}</tbody></table></div>}</div>
      <div className="field" style={{marginTop:18}}><label>ملاحظة</label><input value={note} onChange={(e)=>setNote(e.target.value)}/></div><div className="rowsplit" style={{marginTop:18,gap:8,justifyContent:'flex-end'}}><button type="button" className="btn ghost" disabled={busy} onClick={()=>setEditing(null)}>إلغاء</button><button type="button" className="btn" disabled={busy||(!checkIn&&!checkOut)} onClick={save}>{busy?'جارٍ الحفظ…':'اعتماد'}</button></div>
    </div></div></div>}
  </div>;
}
