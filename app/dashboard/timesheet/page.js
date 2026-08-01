'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { STATUS_AR, STATUS_CLASS } from '@/lib/requests';

export default function Timesheet() {
  const router = useRouter();
  const [weeks, setWeeks] = useState(null);
  const [sum, setSum] = useState({});
  const [projects, setProjects] = useState([]);
  const [cons, setCons] = useState([]);
  const [pcs, setPcs] = useState([]);
  const [role, setRole] = useState(null);
  const [pick, setPick] = useState({ project_id:'', contractor_id:'', start_date:'' });
  const [earlier, setEarlier] = useState({ start:'', end:'' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [w, s, p, c, pc, u] = await Promise.all([
      supabase.from('timesheet_weeks').select('*').order('start_date', { ascending:false }),
      supabase.from('v_week_summary').select('*'),
      supabase.from('projects').select('id, project_no, name_ar, stage')
        .in('stage', ['awarded','execution']).order('name_ar'),
      supabase.from('contractors').select('id, name_ar').eq('is_active', true).order('name_ar'),
      supabase.from('project_contractors').select('*'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setWeeks(w.data || []);
    const m = {}; (s.data || []).forEach((x)=>{ m[x.week_id] = x; });
    setSum(m);
    setProjects(p.data || []); setCons(c.data || []); setPcs(pc.data || []);
    setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  async function createWeek() {
    if (!pick.project_id) { setErr('اختر المشروع أولاً'); return; }
    setErr(''); setBusy(true);
    const { data, error } = await supabase.rpc('new_timesheet_week', {
      p_project: pick.project_id,
      p_contractor: pick.contractor_id || null,
      p_start: pick.start_date || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/dashboard/timesheet/${data}`);
  }

  async function addEarlier() {
    if (!pick.project_id || !earlier.start || !earlier.end) {
      setErr('اختر المشروع وحدّد تاريخي البداية والنهاية'); return;
    }
    setErr(''); setBusy(true);
    const { error } = await supabase.rpc('insert_earlier_week', {
      p_project: pick.project_id, p_contractor: pick.contractor_id || null,
      p_start: earlier.start, p_end: earlier.end,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('أُضيف أسبوع سابق وأُعيد ترقيم الأسابيع');
    setEarlier({ start:'', end:'' }); load();
  }

  async function removeWeek(w) {
    if (!window.confirm('حذف هذا الأسبوع وكل أيامه وحضوره؟')) return;
    const { error } = await supabase.from('timesheet_weeks').delete().eq('id', w.id);
    if (error) setErr(error.message); else { setMsg('حُذف الأسبوع'); load(); }
  }

  if (!weeks) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant','supervisor'].includes(role);
  const nameOfP = (id) => projects.find((p)=>p.id===id)?.name_ar || '—';
  const nameOfC = (id) => cons.find((c)=>c.id===id)?.name_ar || '—';
  const hasAgreement = pick.project_id && pick.contractor_id &&
    pcs.some((x)=>x.project_id===pick.project_id && x.contractor_id===pick.contractor_id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>التايم شيت الأسبوعي</h1>
          <p>السبت إلى الخميس — الحضور والإنتاج ومصروفات اليوم</p>
        </div>
        <Link className="btn ghost" href="/dashboard/labor">الأيدي العاملة</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {canWrite && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>أسبوع جديد</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field span2">
                <label>المشروع *</label>
                <select value={pick.project_id}
                        onChange={(e)=>setPick({...pick, project_id:e.target.value})}>
                  <option value="">—</option>
                  {projects.map((p)=>(
                    <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>المقاول</label>
                <select value={pick.contractor_id}
                        onChange={(e)=>setPick({...pick, contractor_id:e.target.value})}>
                  <option value="">—</option>
                  {cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </div>
              <div className="field">
                <label>تاريخ بداية الأسبوع</label>
                <input type="date" dir="ltr" value={pick.start_date}
                       onChange={(e)=>setPick({...pick, start_date:e.target.value})} />
                <span className="hint">
                  اتركه فارغاً ليكمل من نهاية آخر أسبوع — أو اكتبه للمشاريع الجارية
                </span>
              </div>
            </div>
            {pick.project_id && pick.contractor_id && !hasAgreement && (
              <div className="msg err" style={{marginBottom:12}}>
                لا يوجد اتفاق مسجَّل بين هذا المشروع وهذا المقاول — سجّله من بطاقة المشروع
                لتُحسب اليوميات وتصنيف المصروفات تلقائياً
              </div>
            )}
            <button className="btn" onClick={createWeek} disabled={busy}>
              {busy ? 'جارٍ…' : 'إنشاء الأسبوع'}
            </button>
            <div className="hint" style={{marginTop:8}}>
              ينتهي عند أقرب خميس — والجمعة تُتخطى
            </div>

            <fieldset style={{marginTop:14}}>
              <legend>أسبوع سابق (لمشروع بدأ قبل استخدام النظام)</legend>
              <div className="form-grid">
                <div className="field">
                  <label>من</label>
                  <input type="date" dir="ltr" value={earlier.start}
                         onChange={(e)=>setEarlier({...earlier, start:e.target.value})} />
                </div>
                <div className="field">
                  <label>إلى</label>
                  <input type="date" dir="ltr" value={earlier.end}
                         onChange={(e)=>setEarlier({...earlier, end:e.target.value})} />
                </div>
                <div className="field">
                  <label>&nbsp;</label>
                  <button className="btn ghost" onClick={addEarlier} disabled={busy}>
                    إضافة أسبوع سابق
                  </button>
                </div>
              </div>
              <div className="hint">
                يُدرَج في موضعه الزمني الصحيح ويُعاد ترقيم كل الأسابيع بترتيب التواريخ
              </div>
            </fieldset>
          </div>
        </div>
      )}

      <div className="section">
        <header><h2>الأسابيع</h2></header>
        {weeks.length === 0 ? (
          <div className="empty">
            <h3>لا أسابيع</h3>
            <p>أنشئ أول أسبوع من الأعلى بعد تسجيل الاتفاق والعمالة.</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>الأسبوع</th><th>المشروع</th><th>المقاول</th><th>الفترة</th>
                    <th className="num">أيام</th><th className="num">مستحقات</th>
                    <th className="num">غياب</th><th>الحالة</th>
                    <th style={{width:170}}>الإجراءات</th></tr>
              </thead>
              <tbody>
                {weeks.map((w) => {
                  const s = sum[w.id] || {};
                  return (
                    <tr key={w.id}>
                      <td className="mono">#{w.week_no}</td>
                      <td><Link href={`/dashboard/timesheet/${w.id}`}>{nameOfP(w.project_id)}</Link></td>
                      <td style={{fontSize:12.5}}>{nameOfC(w.contractor_id)}</td>
                      <td className="mono" style={{fontSize:12.5}}>
                        {dateAr(w.start_date)} — {dateAr(w.end_date)}
                      </td>
                      <td className="num">{s.days_count ?? 0}</td>
                      <td className="num">{money(s.works_amount || 0)}</td>
                      <td className="num">
                        {Number(s.absent_days || 0) > 0
                          ? <span className="pill bad">{s.absent_days}</span> : '—'}
                      </td>
                      <td><span className={`pill ${STATUS_CLASS[w.status]}`}>
                        {STATUS_AR[w.status]}</span></td>
                      <td>
                        <div className="rowsplit">
                          <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                href={`/dashboard/timesheet/${w.id}`}>فتح</Link>
                          {canWrite && (
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                            borderColor:'#EBC3C0',color:'#A32B24'}}
                                    onClick={()=>removeWeek(w)}>حذف</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
