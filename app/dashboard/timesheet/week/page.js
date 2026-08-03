'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  شاشة الأسبوع : أفراد × أيام
//  الافتراض حضور كامل — لا تلمس إلا الاستثناء
//  المسار : /dashboard/timesheet/week
// ============================================================

const MAROON = '#8B3332';

const STATUS = {
  full:    { ar: 'كامل',  short: 'ك', factor: 1,   bg: '#E8F3EA', fg: '#2E6B3A' },
  half:    { ar: 'نصف',   short: '½', factor: 0.5, bg: '#FDF3DF', fg: '#8A6100' },
  absent:  { ar: 'غياب',  short: '−', factor: 0,   bg: '#FBECEC', fg: '#A32B24' },
  stopped: { ar: 'توقف',  short: 'ت', factor: 1,   bg: '#EDF0F6', fg: '#3C4A6B' },
  leave:   { ar: 'إجازة', short: 'إ', factor: 0,   bg: '#F2EEF6', fg: '#5B4380' },
};
const CYCLE = ['full', 'half', 'absent', 'stopped', 'leave'];

// السبت → الخميس
const DAY_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso = (d) => d.toISOString().slice(0, 10);

function weekDays(startISO) {
  if (!startISO) return [];
  const out = [];
  const s = new Date(startISO + 'T00:00:00');
  for (let i = 0; i < 6; i++) {
    const d = new Date(s); d.setDate(s.getDate() + i);
    out.push(iso(d));
  }
  return out;
}

// أقرب سبت سابق أو اليوم نفسه
function lastSaturday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return iso(d);
}

export default function TimesheetWeek() {
  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [items, setItems] = useState([]);
  const [laborers, setLaborers] = useState([]);

  const [projectId, setProjectId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [start, setStart] = useState(lastSaturday());

  const [weeks, setWeeks] = useState([]);
  const [weekId, setWeekId] = useState(null);
  const [dayIds, setDayIds] = useState({});     // تاريخ → معرّف اليوم
  const [marks, setMarks] = useState({});       // "laborerId|تاريخ" → حالة
  const [output, setOutput] = useState({});     // تاريخ → إنتاج
  const [itemOf, setItemOf] = useState({});     // تاريخ → بند
  const [dayNote, setDayNote] = useState({});

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const days = weekDays(start);

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from('projects').select('id, project_no, name_ar').order('project_no'),
        supabase.from('contractors').select('id, contractor_no, name_ar').eq('is_active', true).order('name_ar'),
      ]);
      setProjects(p.data || []);
      setContractors(c.data || []);
    })();
  }, []);

  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    supabase.from('project_items')
      .select('id, description_ar, unit, sort_order')
      .eq('project_id', projectId).order('sort_order')
      .then(({ data }) => setItems(data || []));
  }, [projectId]);

  // أسابيع المشروع مع مقاوليها
  const loadWeeks = useCallback(async (pid) => {
    if (!pid) { setWeeks([]); return; }
    const { data } = await supabase.from('timesheet_weeks')
      .select('id, week_no, start_date, end_date, contractor_id, status')
      .eq('project_id', pid)
      .order('start_date', { ascending: false });
    setWeeks(data || []);
  }, []);

  useEffect(() => { loadWeeks(projectId); }, [projectId, loadWeeks]);

  const nameOf = (cid) =>
    contractors.find((c) => c.id === cid)?.name_ar || 'مقاول';

  // تجميع الأسابيع حسب تاريخ البداية
  const grouped = weeks.reduce((acc, w) => {
    (acc[w.start_date] = acc[w.start_date] || []).push(w);
    return acc;
  }, {});

  // ---------- فتح الأسبوع ----------
  const openWeek = useCallback(async (cidArg, stArg) => {
    const cid = cidArg || contractorId;
    const st  = stArg  || start;
    const dys = weekDays(st);
    if (cidArg) setContractorId(cidArg);
    if (stArg)  setStart(stArg);
    setErr(''); setMsg(''); setLoading(true);
    setWeekId(null); setDayIds({}); setMarks({}); setOutput({}); setItemOf({}); setDayNote({});

    try {
      const end = dys[dys.length - 1];

      // عمالة المقاول
      const { data: labs, error: le } = await supabase
        .from('laborers')
        .select('id, full_name, labor_class, trade, daily_rate, group_code, is_active')
        .eq('contractor_id', cid)
        .eq('is_active', true)
        .order('labor_class').order('full_name');
      if (le) throw le;
      setLaborers(labs || []);

      // أسبوع قائم أم جديد
      let { data: wk } = await supabase.from('timesheet_weeks')
        .select('id, start_date, end_date')
        .eq('project_id', projectId).eq('contractor_id', cid)
        .eq('start_date', st).maybeSingle();

      if (!wk) {
        const { count } = await supabase.from('timesheet_weeks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId).eq('contractor_id', cid);
        const ins = await supabase.from('timesheet_weeks').insert({
          project_id: projectId, contractor_id: cid,
          week_no: (count || 0) + 1, start_date: st, end_date: end,
        }).select('id').single();
        if (ins.error) throw ins.error;
        wk = ins.data;
      }
      setWeekId(wk.id);

      // أيام الأسبوع
      const { data: existing } = await supabase.from('timesheet_days')
        .select('id, work_date, notes').eq('week_id', wk.id);
      const map = {}; const notes = {};
      (existing || []).forEach((d) => { map[d.work_date] = d.id; notes[d.work_date] = d.notes || ''; });

      const missing = dys.filter((d) => !map[d]);
      if (missing.length) {
        const { data: made, error: de } = await supabase.from('timesheet_days')
          .insert(missing.map((d) => ({ week_id: wk.id, work_date: d })))
          .select('id, work_date');
        if (de) throw de;
        (made || []).forEach((d) => { map[d.work_date] = d.id; });
      }
      setDayIds(map); setDayNote(notes);

      const ids = Object.values(map);

      // الحضور المسجّل
      const { data: att } = await supabase.from('attendance')
        .select('day_id, laborer_id, status').in('day_id', ids);
      const m = {};
      const dateOf = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
      (att || []).forEach((a) => { m[`${a.laborer_id}|${dateOf[a.day_id]}`] = a.status; });

      // الافتراض : حاضر كامل لمن لم يُسجَّل
      (labs || []).forEach((l) => {
        dys.forEach((d) => { if (!m[`${l.id}|${d}`]) m[`${l.id}|${d}`] = 'full'; });
      });
      setMarks(m);

      // البند والإنتاج
      const { data: di } = await supabase.from('day_items')
        .select('day_id, project_item_id, group_output').in('day_id', ids);
      const o = {}, it = {};
      (di || []).forEach((x) => {
        const d = dateOf[x.day_id];
        o[d] = x.group_output ?? ''; it[d] = x.project_item_id || '';
      });
      setOutput(o); setItemOf(it);

      await loadWeeks(projectId);
      setMsg(`الأسبوع جاهز — ${(labs || []).length} فرداً × ${dys.length} أيام`);
    } catch (e) {
      setErr('تعذّر فتح الأسبوع: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, contractorId, start, loadWeeks]);

  // ---------- التبديل ----------
  const cycle = (lid, d) => {
    const cur = marks[`${lid}|${d}`] || 'full';
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setMarks((m) => ({ ...m, [`${lid}|${d}`]: next }));
  };
  const setColumn = (d, st) =>
    setMarks((m) => {
      const n = { ...m }; laborers.forEach((l) => { n[`${l.id}|${d}`] = st; }); return n;
    });
  const setRow = (lid, st) =>
    setMarks((m) => {
      const n = { ...m }; days.forEach((d) => { n[`${lid}|${d}`] = st; }); return n;
    });

  // ---------- الحفظ ----------
  async function save() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const ids = Object.values(dayIds);

      await supabase.from('attendance').delete().in('day_id', ids);
      const rows = [];
      laborers.forEach((l) => {
        days.forEach((d) => {
          const st = marks[`${l.id}|${d}`] || 'full';
          const rate = Number(l.daily_rate || 0);
          rows.push({
            day_id: dayIds[d], laborer_id: l.id, status: st,
            rate_used: rate, amount: Math.round(rate * STATUS[st].factor * 100) / 100,
          });
        });
      });
      if (rows.length) {
        const { error } = await supabase.from('attendance').insert(rows);
        if (error) throw error;
      }

      await supabase.from('day_items').delete().in('day_id', ids);
      const dis = days
        .filter((d) => itemOf[d] || output[d] !== '' )
        .map((d) => ({
          day_id: dayIds[d],
          project_item_id: itemOf[d] || null,
          group_output: output[d] === '' || output[d] == null ? null : Number(output[d]),
        }))
        .filter((x) => x.project_item_id);
      if (dis.length) {
        const { error } = await supabase.from('day_items').insert(dis);
        if (error) throw error;
      }

      for (const d of days) {
        if (dayNote[d] !== undefined) {
          await supabase.from('timesheet_days').update({ notes: dayNote[d] }).eq('id', dayIds[d]);
        }
      }

      setMsg('حُفظ الأسبوع بنجاح');
    } catch (e) {
      setErr('تعذّر الحفظ: ' + (e.message || e));
    }
    setBusy(false);
  }

  // ---------- الإجماليات ----------
  const dayTotal = (d) =>
    laborers.reduce((t, l) =>
      t + Number(l.daily_rate || 0) * STATUS[marks[`${l.id}|${d}`] || 'full'].factor, 0);
  const weekTotal = days.reduce((t, d) => t + dayTotal(d), 0);
  const presentOn = (d) =>
    laborers.filter((l) => ['full','half','stopped'].includes(marks[`${l.id}|${d}`] || 'full')).length;

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>التايم شيت الأسبوعي</h1>
          <p>اختر أسبوعاً قائماً من القائمة، أو افتح أسبوعاً جديداً بتحديد المقاول والتاريخ</p>
        </div>
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>المشروع</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>المقاول</label>
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">— اختر —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>بداية الأسبوع (السبت)</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <button className="btn" onClick={() => openWeek()}
                  disabled={!projectId || !contractorId || loading}>
            {loading ? 'جارٍ…' : 'فتح الأسبوع'}
          </button>
        </div>
      </div>

      {projectId && Object.keys(grouped).length > 0 && (
        <div className="section">
          <header>
            <h2>أسابيع المشروع ({Object.keys(grouped).length})</h2>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              اختر الأسبوع ثم المقاول الذي تريد العمل عليه
            </span>
          </header>
          <div style={{ padding: '4px 16px 14px' }}>
            {Object.entries(grouped).map(([sd, list]) => (
              <div key={sd} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 0', borderBottom: '1px solid #f0eded',
              }}>
                <div style={{ minWidth: 190 }}>
                  <span style={{ fontWeight: 500 }}>الأسبوع {list[0].week_no}</span>
                  <span style={{ fontSize: 11.5, color: '#888', marginInlineStart: 8, direction: 'ltr' }}>
                    {sd} → {list[0].end_date}
                  </span>
                </div>
                {list.map((w) => (
                  <button key={w.id} type="button"
                          onClick={() => openWeek(w.contractor_id, w.start_date)}
                          style={{
                            fontSize: 12.5, padding: '4px 12px', cursor: 'pointer',
                            borderRadius: 5, background: '#fff',
                            border: '1px solid ' + (weekId === w.id ? MAROON : '#ddd'),
                            color: weekId === w.id ? MAROON : '#444',
                          }}>
                    {nameOf(w.contractor_id)}
                  </button>
                ))}
                <span style={{ fontSize: 11.5, color: '#999' }}>
                  {list.length > 1 ? `${list.length} مقاولين` : 'مقاول واحد'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}

      {weekId && laborers.length > 0 && (
        <>
          <div className="section">
            <header>
              <h2>الحضور</h2>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                {CYCLE.map((k) => (
                  <span key={k} style={{
                    background: STATUS[k].bg, color: STATUS[k].fg,
                    padding: '2px 9px', borderRadius: 4,
                  }}>{STATUS[k].short} {STATUS[k].ar}</span>
                ))}
              </div>
            </header>

            <div style={{ overflowX: 'auto', padding: '0 4px 10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', minWidth: 180 }}>الاسم</th>
                    <th style={{ padding: '8px 6px' }}>الفئة</th>
                    {days.map((d) => {
                      const dt = new Date(d + 'T00:00:00');
                      return (
                        <th key={d} style={{ padding: '6px 4px', minWidth: 78 }}>
                          <div>{DAY_AR[dt.getDay()]}</div>
                          <div style={{ fontSize: 11, opacity: .7, direction: 'ltr' }}>{d.slice(5)}</div>
                          <button type="button" onClick={() => setColumn(d, 'full')}
                                  style={miniBtn}>الكل حاضر</button>
                        </th>
                      );
                    })}
                    <th style={{ padding: '8px 6px' }}>أيامه</th>
                  </tr>
                </thead>
                <tbody>
                  {laborers.map((l) => {
                    const mine = days.reduce((t, d) =>
                      t + STATUS[marks[`${l.id}|${d}`] || 'full'].factor, 0);
                    return (
                      <tr key={l.id}>
                        <td style={{ padding: '6px 10px' }}>
                          <div>{l.full_name}</div>
                          <button type="button" onClick={() => setRow(l.id, 'absent')} style={miniBtn}>
                            غائب الأسبوع
                          </button>
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center', fontSize: 12, opacity: .8 }}>
                          {l.trade || l.labor_class || '—'}
                        </td>
                        {days.map((d) => {
                          const st = marks[`${l.id}|${d}`] || 'full';
                          return (
                            <td key={d} style={{ padding: 3, textAlign: 'center' }}>
                              <button type="button" onClick={() => cycle(l.id, d)} title={STATUS[st].ar}
                                      style={{
                                        width: '100%', padding: '7px 0', cursor: 'pointer',
                                        border: '1px solid rgba(0,0,0,.08)', borderRadius: 5,
                                        background: STATUS[st].bg, color: STATUS[st].fg,
                                        fontSize: 14, fontWeight: 500,
                                      }}>{STATUS[st].short}</button>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 500 }}>{mine}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td style={{ padding: '8px 10px' }}>الحاضرون</td>
                    <td />
                    {days.map((d) => (
                      <td key={d} style={{ textAlign: 'center' }}>{presentOn(d)}</td>
                    ))}
                    <td />
                  </tr>
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td style={{ padding: '8px 10px' }}>قيمة اليوم</td>
                    <td />
                    {days.map((d) => (
                      <td key={d} style={{ textAlign: 'center', direction: 'ltr' }}>
                        {dayTotal(d).toLocaleString('en-US')}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>
                      {weekTotal.toLocaleString('en-US')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="section">
            <header><h2>البند والإنتاج اليومي</h2></header>
            <div style={{ overflowX: 'auto', padding: '0 4px 10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', width: 90 }}>اليوم</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>البند</th>
                    <th style={{ padding: '8px', width: 120 }}>المنجز</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>ملاحظات اليوم</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const dt = new Date(d + 'T00:00:00');
                    return (
                      <tr key={d}>
                        <td style={{ padding: '6px 10px' }}>
                          {DAY_AR[dt.getDay()]}
                          <div style={{ fontSize: 11, opacity: .7, direction: 'ltr' }}>{d}</div>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <select value={itemOf[d] || ''} style={{ width: '100%' }}
                                  onChange={(e) => setItemOf((x) => ({ ...x, [d]: e.target.value }))}>
                            <option value="">— بلا بند —</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>{it.description_ar}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input type="number" step="any" dir="ltr" style={{ width: '100%', textAlign: 'center' }}
                                 value={output[d] ?? ''}
                                 onChange={(e) => setOutput((x) => ({ ...x, [d]: e.target.value }))} />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input value={dayNote[d] || ''} style={{ width: '100%' }}
                                 onChange={(e) => setDayNote((x) => ({ ...x, [d]: e.target.value }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '4px 0 30px' }}>
            <button className="btn" onClick={save} disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ الأسبوع'}
            </button>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              الحفظ يستبدل حضور هذا الأسبوع بالكامل بما تراه الآن
            </span>
          </div>
        </>
      )}

      {weekId && laborers.length === 0 && (
        <div className="empty">
          <h3>لا عمالة مسجّلة لهذا المقاول</h3>
          <p>سجّل العمال والصنايعية في ملف المقاول أولاً، ثم افتح الأسبوع من جديد.</p>
        </div>
      )}
    </div>
  );
}

const miniBtn = {
  marginTop: 4, fontSize: 10.5, padding: '1px 6px', cursor: 'pointer',
  border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#777',
};
