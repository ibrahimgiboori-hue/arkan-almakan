'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, daysUntil } from '@/lib/format';

const TYPES = ['إقامة','هوية وطنية','جواز سفر','رخصة قيادة','شهادة علمية',
  'رخصة مهنية','تأمين طبي','شهادة صحية','عقد موقّع','أخرى'];

export default function EmpDocuments({ employeeId }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ doc_type:'إقامة', doc_number:'', issue_date:'', expiry_date:'', alert_days_before:60, notes:'' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => supabase.from('employee_documents')
    .select('*').eq('employee_id', employeeId).order('expiry_date', { nullsFirst: false })
    .then(({ data }) => setRows(data || []));

  useEffect(() => { load(); }, [employeeId]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);

    let path = null;
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      path = `${employeeId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('hr-docs').upload(path, file);
      if (up.error) { setErr('تعذّر رفع الملف: ' + up.error.message); setBusy(false); return; }
    }

    const { error } = await supabase.from('employee_documents').insert({
      employee_id: employeeId, ...f,
      issue_date: f.issue_date || null, expiry_date: f.expiry_date || null,
      alert_days_before: Number(f.alert_days_before || 60),
      file_path: path,
    });

    setBusy(false);
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('تم إضافة المستند');
    setF({ doc_type:'إقامة', doc_number:'', issue_date:'', expiry_date:'', alert_days_before:60, notes:'' });
    setFile(null); load();
  }

  async function openFile(path) {
    const { data, error } = await supabase.storage.from('hr-docs').createSignedUrl(path, 300);
    if (error) { setErr('تعذّر فتح الملف: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <form onSubmit={save} className="section" style={{marginTop:0,padding:18}}>
        <div className="form-grid">
          <div className="field">
            <label>نوع المستند *</label>
            <select value={f.doc_type} onChange={set('doc_type')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>الرقم</label>
            <input dir="ltr" value={f.doc_number} onChange={set('doc_number')} />
          </div>
          <div className="field">
            <label>تاريخ الإصدار</label>
            <input type="date" dir="ltr" value={f.issue_date} onChange={set('issue_date')} />
          </div>
          <div className="field">
            <label>تاريخ الانتهاء</label>
            <input type="date" dir="ltr" value={f.expiry_date} onChange={set('expiry_date')} />
          </div>
          <div className="field">
            <label>التنبيه قبل (يوم)</label>
            <input type="number" min="0" dir="ltr" value={f.alert_days_before} onChange={set('alert_days_before')} />
          </div>
          <div className="field">
            <label>صورة المستند</label>
            <input type="file" accept="image/*,application/pdf"
                   onChange={(e)=>setFile(e.target.files?.[0] || null)} style={{fontSize:13}} />
            <span className="hint">تُحفظ في مخزن خاص لا يُقرأ إلا برابط مؤقت</span>
          </div>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'إضافة المستند'}
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="section" style={{marginTop:14}}>
          <div className="empty">
            <h3>لا مستندات</h3>
            <p>أضف الإقامة أو الهوية ليتابع النظام تاريخ انتهائها وينبهك قبله.</p>
          </div>
        </div>
      ) : (
        <div className="section" style={{marginTop:14}}>
          <table>
            <thead>
              <tr><th>النوع</th><th>الرقم</th><th>الإصدار</th><th>الانتهاء</th>
                  <th>المتبقي</th><th>الملف</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const left = daysUntil(d.expiry_date);
                const cls = left === null ? '' : left < 0 ? 'bad' : left <= 30 ? 'bad' : left <= 60 ? 'warn' : 'ok';
                return (
                  <tr key={d.id}>
                    <td>{d.doc_type}</td>
                    <td className="mono">{d.doc_number || '—'}</td>
                    <td className="mono">{dateAr(d.issue_date)}</td>
                    <td className="mono">{dateAr(d.expiry_date)}</td>
                    <td>
                      {left === null ? '—' : (
                        <span className={`pill ${cls}`}>
                          {left < 0 ? `منتهٍ منذ ${Math.abs(left)} يوم` : `${left} يوم`}
                        </span>
                      )}
                    </td>
                    <td>
                      {d.file_path
                        ? <button className="btn ghost" style={{padding:'4px 10px',fontSize:13}}
                                  onClick={()=>openFile(d.file_path)}>فتح</button>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
