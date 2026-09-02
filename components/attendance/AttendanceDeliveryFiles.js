'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(d);
}

function remainingText(value) {
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'انتهت المدة — بانتظار الحذف التلقائي';
  const hours = Math.ceil(ms / 3600000);
  if (hours < 24) return `${hours} ساعة متبقية`;
  const days = Math.ceil(hours / 24);
  return `${days} يوم متبقٍ`;
}

export default function AttendanceDeliveryFiles({ refreshKey = 0 }) {
  const [rows,setRows] = useState([]);
  const [busyId,setBusyId] = useState('');
  const [err,setErr] = useState('');

  async function load() {
    setErr('');
    const q = await supabase.from('hr_attendance_delivery_files')
      .select('id,client_name,period_from,period_to,file_name,storage_bucket,storage_path,retention_days,expires_at,created_at')
      .order('created_at',{ascending:false});
    if (q.error) { setErr(q.error.message); setRows([]); return; }
    setRows(q.data || []);
  }

  useEffect(()=>{ load(); },[refreshKey]);

  async function download(row) {
    setBusyId(row.id); setErr('');
    const q = await supabase.storage.from(row.storage_bucket || 'workspace-files').createSignedUrl(row.storage_path,300,{download:row.file_name});
    setBusyId('');
    if (q.error) { setErr(q.error.message); return; }
    window.open(q.data.signedUrl,'_blank','noopener,noreferrer');
  }

  async function remove(row) {
    const yes = window.confirm(`حذف النسخة المؤقتة «${row.file_name}» الآن؟ لن يمكن استرجاعها من البرنامج بعد الحذف.`);
    if (!yes) return;
    setBusyId(row.id); setErr('');
    const s = await supabase.storage.from(row.storage_bucket || 'workspace-files').remove([row.storage_path]);
    if (s.error) { setBusyId(''); setErr(s.error.message); return; }
    const d = await supabase.from('hr_attendance_delivery_files').delete().eq('id',row.id);
    setBusyId('');
    if (d.error) { setErr(d.error.message); return; }
    await load();
  }

  if (!rows.length && !err) return null;

  return <div className="section">
    <header><h2>ملفات التسليم المؤقتة</h2><span className="hint">ملفات Excel النهائية فقط. كل ملف يُحذف تلقائيًا عند انتهاء المدة التي حددتها، ويمكنك حذفه قبلها يدويًا.</span></header>
    <div style={{padding:18}}>
      {err&&<div className="msg err">{err}</div>}
      {rows.length>0&&<div style={{overflowX:'auto'}}><table>
        <thead><tr><th>العميل</th><th>الفترة</th><th>الملف</th><th>مدة الاحتفاظ</th><th>موعد الحذف</th><th>الحالة</th><th>الإجراء</th></tr></thead>
        <tbody>{rows.map((r)=><tr key={r.id}>
          <td>{r.client_name||'عميل خارجي'}</td>
          <td>{r.period_from||'—'} — {r.period_to||'—'}</td>
          <td>{r.file_name}</td>
          <td>{r.retention_days} يوم</td>
          <td>{fmtDateTime(r.expires_at)}</td>
          <td>{remainingText(r.expires_at)}</td>
          <td><div className="rowsplit">
            <button className="btn ghost" disabled={busyId===r.id} onClick={()=>download(r)}>تنزيل</button>
            <button className="btn ghost" disabled={busyId===r.id} onClick={()=>remove(r)}>حذف الآن</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  </div>;
}
