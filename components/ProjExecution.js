'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, qty as fq, dateAr } from '@/lib/format';
import { MODE_AR } from '@/lib/projects';
import { notifyChange, useLiveRefresh } from '@/lib/live';

const ST_AR = { planned:'جاهز للتنفيذ', active:'قيد التنفيذ', paused:'متوقف', done:'منتهٍ' };
const ST_CLS = { planned:'warn', active:'ok', paused:'', done:'' };

export default function ProjExecution({ projectId, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [plan, setPlan] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [busy, setBusy] = useState(null);
  const [askFor, setAskFor] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [project, setProject] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [s, a, w] = await Promise.all([
      supabase.from('v_item_execution_state').select('*')
        .eq('project_id', projectId).order('sort_order'),
      supabase.from('v_item_actual_vs_plan').select('*').eq('project_id', projectId),
      supabase.from('timesheet_weeks').select('*').eq('project_id', projectId)
        .order('week_no', { ascending: false }),
    ]);
    setRows(s.data || []); setPlan(a.data || []); setWeeks(w.data || []);
    const { data: pr } = await supabase.from('projects')
      .select('commencement_date, name_ar').eq('id', projectId).maybeSingle();
    setProject(pr || null);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['exec','scope','timesheet','budget','all']);

  function openStart(r) {
    setAskFor(r);
    setStartDate(r.started_at || project?.commencement_date
                 || new Date().toISOString().slice(0,10));
    setErr(''); setMsg('');
  }

  async function start(r, date) {
    setBusy(r.project_item_id); setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('start_item_execution',
      { p_item: r.project_item_id, p_start_date: date || null });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    const parts = ['بدأ التنفيذ'];
    if (data?.created_agreement) parts.push('وأُنشئ اتفاق المقاول');
    if (data?.created_week) parts.push('وفُتح أسبوع تايم شيت');
    setMsg(parts.join(' ') + '.');
    setAskFor(null);
    load(); notifyChange('exec'); onChange?.();
    if (data?.week_id) setTimeout(()=>window.open(`/dashboard/timesheet/${data.week_id}`,'_blank'), 400);
  }

  async function finish(r) {
    if (!window.confirm('إنهاء تنفيذ هذا البند؟')) return;
    const { error } = await supabase.rpc('finish_item_execution', { p_item: r.project_item_id });
    if (error) setErr(error.message);
    else { setMsg('أُنهي البند'); load(); notifyChange('exec'); onChange?.(); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const withDecision = rows.filter((r)=>r.has_decision);
  const without = rows.filter((r)=>!r.has_decision);
  const planOf = (id) => plan.find((p)=>p.project_item_id===id);

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {without.length > 0 && (
        <div className="msg err" style={{marginBottom:12}}>
          {without.length} بنداً بلا قرار تنفيذ — سجّل القرار من تبويب «النطاق والقرارات»
        </div>
      )}

      <div className="section" style={{marginTop:0,overflowX:'auto'}}>
        <header>
          <h2>بنود التنفيذ ({withDecision.length})</h2>
          <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>
            البند الذي له قرار يبدأ التنفيذ ويفتح تايم شيته
          </span>
        </header>

        {withDecision.length === 0 ? (
          <div className="empty">
            <h3>لا بنود جاهزة</h3>
            <p>سجّل قرار تنفيذ لبند من تبويب «النطاق والقرارات» ليظهر هنا.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>البند</th><th>الطريقة</th><th>المنفّذ</th><th>الحالة</th>
                  <th className="num">الإنجاز</th><th className="num">أيام</th>
                  <th className="num">المخطط</th><th className="num">الفعلي</th>
                  <th style={{width:190}}>الإجراءات</th></tr>
            </thead>
            <tbody>
              {withDecision.map((r) => {
                const p = planOf(r.project_item_id);
                const over = p?.cost_used_pct != null && Number(p.cost_used_pct) > 100;
                return (
                  <tr key={r.project_item_id}>
                    <td>{r.description_ar || '—'}
                      <div style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                        {fq(r.contract_qty)} {r.unit} × {money(r.sell_price)}
                      </div>
                    </td>
                    <td style={{fontSize:12.5}}>{MODE_AR[r.mode]}</td>
                    <td style={{fontSize:12.5}}>{r.contractor_name || '—'}</td>
                    <td>
                      <span className={`pill ${ST_CLS[r.status]}`}>{ST_AR[r.status]}</span>
                      {r.started_at && (
                        <div className="mono" style={{fontSize:11,color:'var(--ink-soft)'}}>
                          {dateAr(r.started_at)}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {fq(Math.max(r.output_from_timesheet||0, r.output_manual||0))}
                      {p && (
                        <div style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                          {Number(p.progress_pct||0).toFixed(0)}%
                        </div>
                      )}
                    </td>
                    <td className="num">{r.days_worked || 0}</td>
                    <td className="num">{money(r.planned_cost || 0)}</td>
                    <td className="num" style={over ? {color:'var(--bad)',fontWeight:600} : undefined}>
                      {money(p?.actual_cost || 0)}
                      {p?.cost_used_pct != null && (
                        <div style={{fontSize:11.5}}>{Number(p.cost_used_pct).toFixed(0)}%</div>
                      )}
                    </td>
                    <td>
                      <div className="rowsplit">
                        {canWrite && r.status === 'planned' && (
                          <button className="btn" style={{padding:'4px 9px',fontSize:12.5}}
                                  disabled={busy === r.project_item_id}
                                  onClick={()=>openStart(r)}>
                            {busy === r.project_item_id ? 'جارٍ…' : 'ابدأ التنفيذ'}
                          </button>
                        )}
                        {r.status === 'active' && (
                          <>
                            {r.open_week_id && (
                              <Link className="btn" style={{padding:'4px 9px',fontSize:12.5}}
                                    href={`/dashboard/timesheet/${r.open_week_id}`}>
                                التايم شيت
                              </Link>
                            )}
                            {canWrite && (
                              <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                      onClick={()=>finish(r)}>إنهاء</button>
                            )}
                          </>
                        )}
                        {r.status === 'done' && (
                          <span style={{fontSize:12,color:'var(--ok)'}}>اكتمل</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {askFor && (
        <div className="section" style={{borderColor:'var(--maroon)'}}>
          <header><h2>بدء تنفيذ: {askFor.description_ar}</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>تاريخ بدء التنفيذ الفعلي *</label>
                <input type="date" dir="ltr" value={startDate}
                       onChange={(e)=>setStartDate(e.target.value)} />
                <span className="hint">
                  اكتب التاريخ الحقيقي — منه يُبنى أول أسبوع تايم شيت
                </span>
              </div>
              <div className="field span2">
                <label>ماذا سيحدث</label>
                <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.9,
                             padding:'6px 0'}}>
                  يُفعَّل البند بهذا التاريخ · يُنشأ اتفاق المقاول إن لم يوجد ·
                  يُفتح أسبوع تايم شيت يبدأ من هذا التاريخ وينتهي عند أقرب خميس
                </div>
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" disabled={busy === askFor.project_item_id}
                      onClick={()=>start(askFor, startDate)}>
                {busy === askFor.project_item_id ? 'جارٍ…' : 'ابدأ التنفيذ'}
              </button>
              <button className="btn ghost" onClick={()=>setAskFor(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <header>
          <h2>أسابيع التايم شيت</h2>
          <Link className="btn ghost" style={{padding:'4px 10px',fontSize:12.5}}
                href="/dashboard/timesheet">كل الأسابيع</Link>
        </header>
        {weeks.length === 0 ? (
          <div className="empty">
            <h3>لا أسابيع</h3>
            <p>يُفتح الأسبوع تلقائياً عند بدء تنفيذ أول بند.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>الأسبوع</th><th>الفترة</th><th>الحالة</th><th>—</th></tr></thead>
            <tbody>
              {weeks.map((w)=>(
                <tr key={w.id}>
                  <td className="mono">#{w.week_no}</td>
                  <td className="mono" style={{fontSize:12.5}}>
                    {dateAr(w.start_date)} — {dateAr(w.end_date)}
                  </td>
                  <td><span className="pill">{w.status === 'draft' ? 'مفتوح' : 'مغلق'}</span></td>
                  <td>
                    <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                          href={`/dashboard/timesheet/${w.id}`}>فتح</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
