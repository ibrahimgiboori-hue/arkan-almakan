'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  صفحة اليوم : كل ما حدث في هذا التاريخ لهذا المشروع
//  اليوم يُنشأ عند أول إدخال فيه — لا أيام فارغة
//  الحفظ تلقائي، مشروط، ومتسلسل : لا تزاحم ولا تكرار
//  المسار : /dashboard/timesheet/day
// ============================================================

const MAROON = '#8B3332';

const STATUS = {
  absent:  { ar: 'غياب',  short: '−', factor: 0,   bg: '#FBECEC', fg: '#A32B24' },
  full:    { ar: 'كامل',  short: 'ك', factor: 1,   bg: '#E8F3EA', fg: '#2E6B3A' },
  half:    { ar: 'نصف',   short: '½', factor: 0.5, bg: '#FDF3DF', fg: '#8A6100' },
  stopped: { ar: 'توقف',  short: 'ت', factor: 1,   bg: '#EDF0F6', fg: '#3C4A6B' },
  leave:   { ar: 'إجازة', short: 'إ', factor: 0,   bg: '#F2EEF6', fg: '#5B4380' },
};
const CYCLE = ['absent', 'full', 'half', 'stopped', 'leave'];
const DEF = 'absent';

const DAY_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const money = (n) => Number(n || 0).toLocaleString('en-US');

export default function DayEntry() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(iso(new Date()));

  const [dayId, setDayId] = useState(null);
  const [groups, setGroups] = useState([]);       // مقاول ← عماله
  const [marks, setMarks] = useState({});
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);         // بنود اليوم : {id, item, contractor, qty, unit}
  const [note, setNote] = useState('');
  const [machinery, setMachinery] = useState('');
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [sync, setSync] = useState('idle');       // idle | saving | saved | error
  const [err, setErr] = useState('');

  // مراجع حيّة تتجاوز البيانات القديمة المحتجزة أثناء الحفظ
  const dayIdRef  = useRef(null);
  const linesRef  = useRef([]);
  const chainRef  = useRef(Promise.resolve());
  const timers    = useRef({});

  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('p')) setProjectId(q.get('p'));
      if (q.get('d')) setDate(q.get('d'));
    } catch (e) { /* لا شيء */ }

    supabase.from('projects').select('id, project_no, name_ar').order('project_no')
      .then(({ data }) => {
        setProjects(data || []);
        if ((data || []).length === 1) setProjectId((cur) => cur || data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    supabase.from('project_items').select('id, description_ar, unit, sort_order')
      .eq('project_id', projectId).order('sort_order')
      .then(({ data }) => setItems(data || []));
  }, [projectId]);

  // ---------- فتح اليوم ----------
  const openDay = useCallback(async () => {
    if (!projectId || !date) return;
    setLoading(true); setErr(''); setSync('idle');
    try {
      const { data: pc } = await supabase.from('project_contractors')
        .select('contractor_id').eq('project_id', projectId);
      let cids = (pc || []).map((x) => x.contractor_id).filter(Boolean);
      if (!cids.length) {
        const { data: all } = await supabase.from('contractors')
          .select('id').eq('is_active', true);
        cids = (all || []).map((x) => x.id);
      }
      const { data: cs } = await supabase.from('contractors')
        .select('id, name_ar').in('id', cids);
      const { data: labs } = await supabase.from('laborers')
        .select('id, full_name, trade, labor_class, daily_rate, contractor_id')
        .in('contractor_id', cids).eq('is_active', true).order('full_name');

      setGroups((cs || []).map((c) => ({
        ...c, workers: (labs || []).filter((l) => l.contractor_id === c.id),
      })).filter((g) => g.workers.length));

      const { data: day } = await supabase.from('timesheet_days')
        .select('id, notes, machinery').eq('project_id', projectId)
        .eq('work_date', date).maybeSingle();

      const m = {};
      if (day) {
        dayIdRef.current = day.id;
        setDayId(day.id); setNote(day.notes || ''); setMachinery(day.machinery || '');

        const { data: att } = await supabase.from('attendance')
          .select('laborer_id, status').eq('day_id', day.id);
        (att || []).forEach((a) => { m[a.laborer_id] = a.status; });

        const { data: di } = await supabase.from('day_items')
          .select('id, project_item_id, contractor_id, group_output, unit')
          .eq('day_id', day.id);
        const ls = (di || []).map((x) => ({
          id: x.id,
          item: x.project_item_id || '',
          contractor: x.contractor_id || '',
          qty: x.group_output ?? '',
          unit: x.unit || '',
        }));
        linesRef.current = ls; setLines(ls);
      } else {
        dayIdRef.current = null;
        setDayId(null); setNote(''); setMachinery('');
        linesRef.current = []; setLines([]);
      }
      setMarks(m);

      const { data: ev } = await supabase.from('v_day_events')
        .select('*').eq('project_id', projectId).eq('event_date', date);
      setEvents(ev || []);
    } catch (e) {
      setErr('تعذّر فتح اليوم: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, date]);

  useEffect(() => { if (projectId && date) openDay(); }, [projectId, date, openDay]);

  // ---------- محرك الحفظ ----------
  const runSave = useCallback((fn) => {
    setSync('saving');
    chainRef.current = chainRef.current
      .then(fn)
      .then(() => {
        setErr(''); setSync('saved');
        setTimeout(() => setSync((x) => (x === 'saved' ? 'idle' : x)), 1800);
      })
      .catch((e) => {
        setErr('تعذّر الحفظ: ' + (e.message || e));
        setSync('error');
      });
    return chainRef.current;
  }, []);

  // اليوم يُخلق لحظة أول إدخال فيه
  const ensureDay = useCallback(async () => {
    if (dayIdRef.current) return dayIdRef.current;
    const { data, error } = await supabase.rpc('fn_get_or_create_day', {
      p_project_id: projectId, p_date: date,
    });
    if (error) throw error;
    dayIdRef.current = data; setDayId(data);
    return data;
  }, [projectId, date]);

  const debounce = useCallback((key, fn, ms = 700) => {
    clearTimeout(timers.current[key]);
    setSync('saving');
    timers.current[key] = setTimeout(fn, ms);
  }, []);

  // ---------- الحضور ----------
  const persistMarks = useCallback((pairs) => runSave(async () => {
    const id = await ensureDay();
    const rows = pairs.map(([w, st]) => ({
      day_id: id, laborer_id: w.id, status: st, rate_used: Number(w.daily_rate || 0),
    }));
    const { error } = await supabase.from('attendance')
      .upsert(rows, { onConflict: 'day_id,laborer_id' });
    if (error) throw error;
  }), [runSave, ensureDay]);

  const cycle = (w) => {
    const cur = marks[w.id] || DEF;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setMarks((m) => ({ ...m, [w.id]: next }));
    persistMarks([[w, next]]);
  };
  const setGroup = (g, st) => {
    setMarks((m) => {
      const n = { ...m }; g.workers.forEach((w) => { n[w.id] = st; }); return n;
    });
    persistMarks(g.workers.map((w) => [w, st]));
  };

  // ---------- بنود اليوم ----------
  const persistLine = useCallback((idx) => runSave(async () => {
    const l = linesRef.current[idx];
    if (!l || !l.item) return;              // سطر بلا بند لا يُحفظ
    const id = await ensureDay();
    const payload = {
      day_id: id,
      project_item_id: l.item,
      contractor_id: l.contractor || null,
      group_output: l.qty === '' || l.qty == null ? null : Number(l.qty),
      unit: l.unit || null,
    };
    if (l.id) {
      const { error } = await supabase.from('day_items').update(payload).eq('id', l.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('day_items')
        .insert(payload).select('id').single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('هذا البند مسجّل لهذا المقاول في هذا اليوم — عدّل السطر الموجود');
        }
        throw error;
      }
      const next = [...linesRef.current];
      next[idx] = { ...next[idx], id: data.id };
      linesRef.current = next; setLines(next);
    }
  }), [runSave, ensureDay]);

  const editLine = (idx, patch, immediate = false) => {
    const next = linesRef.current.map((y, j) => (j === idx ? { ...y, ...patch } : y));
    linesRef.current = next; setLines(next);
    if (immediate) persistLine(idx);
    else debounce('line' + idx, () => persistLine(idx));
  };

  const addLine = () => {
    const next = [...linesRef.current, { id: null, item: '', contractor: '', qty: '', unit: '' }];
    linesRef.current = next; setLines(next);
  };

  const removeLine = (idx) => {
    const l = linesRef.current[idx];
    const next = linesRef.current.filter((_, j) => j !== idx);
    linesRef.current = next; setLines(next);
    if (l?.id) runSave(async () => {
      const { error } = await supabase.from('day_items').delete().eq('id', l.id);
      if (error) throw error;
    });
  };

  // ---------- ملاحظات اليوم ----------
  const persistDay = useCallback((patch) => runSave(async () => {
    const id = await ensureDay();
    const { error } = await supabase.from('timesheet_days').update(patch).eq('id', id);
    if (error) throw error;
  }), [runSave, ensureDay]);

  const changeNote = (v) => {
    setNote(v);
    debounce('note', () => persistDay({ notes: v || null }));
  };
  const changeMachinery = (v) => {
    setMachinery(v);
    debounce('mach', () => persistDay({ machinery: v || null }));
  };

  // ---------- الإجماليات ----------
  const dayValue = groups.reduce((t, g) => t + g.workers.reduce((s, w) =>
    s + Number(w.daily_rate || 0) * STATUS[marks[w.id] || DEF].factor, 0), 0);
  const presentCount = groups.reduce((t, g) => t + g.workers
    .filter((w) => ['full','half','stopped'].includes(marks[w.id] || DEF)).length, 0);
  const dt = new Date(date + 'T00:00:00');
  const nameOfContractor = (cid) => groups.find((g) => g.id === cid)?.name_ar || '';

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>يوم العمل</h1>
          <p>كل ما حدث في هذا التاريخ — حضور كل المقاولين والإنتاج والوقائع. الحفظ تلقائي.</p>
        </div>
        {projectId && (
          <span style={{
            fontSize: 13, padding: '6px 14px', borderRadius: 6,
            background: sync === 'error' ? '#FBECEC' : sync === 'saving' ? '#FDF3DF' : '#E8F3EA',
            color: sync === 'error' ? '#A32B24' : sync === 'saving' ? '#8A6100' : '#2E6B3A',
          }}>
            {sync === 'saving' ? 'يُحفظ…' : sync === 'error' ? 'لم يُحفظ' : 'محفوظ تلقائياً'}
          </span>
        )}
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 240 }}>
            <label>المشروع</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label>التاريخ — {DAY_AR[dt.getDay()]}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn ghost" onClick={() => setDate(shift(date, -1))}>اليوم السابق</button>
          <button className="btn ghost" onClick={() => setDate(shift(date, 1))}>اليوم التالي</button>
          <button className="btn ghost" onClick={() => setDate(iso(new Date()))}>اليوم</button>
          {dayId && <span style={{ fontSize: 12.5, color: '#2E6B3A' }}>يوم مسجّل</span>}
          {!dayId && projectId && (
            <span style={{ fontSize: 12.5, color: '#8A6100' }}>
              يوم جديد — يُنشأ عند أول إدخال
            </span>
          )}
        </div>
      </div>

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {loading && <div className="empty">جارٍ التحميل…</div>}

      {projectId && !loading && groups.map((g) => (
        <div className="section" key={g.id}>
          <header>
            <h2>{g.name_ar}</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost" style={sm} onClick={() => setGroup(g, 'full')}>حضور الكل</button>
              <button className="btn ghost" style={sm} onClick={() => setGroup(g, 'absent')}>تصفير</button>
            </div>
          </header>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16 }}>
            {g.workers.map((w) => {
              const st = marks[w.id] || DEF;
              return (
                <button key={w.id} type="button" onClick={() => cycle(w)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                          border: '1px solid rgba(0,0,0,.08)',
                          background: STATUS[st].bg, color: STATUS[st].fg, fontSize: 13,
                        }}>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{STATUS[st].short}</span>
                  <span>{w.full_name}</span>
                  <span style={{ fontSize: 11, opacity: .75 }}>{w.trade || w.labor_class || ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {projectId && !loading && (
        <>
          <div className="section">
            <header>
              <h2>البنود المنفَّذة اليوم</h2>
              <button className="btn ghost" style={sm} onClick={addLine}>إضافة بند</button>
            </header>
            <div style={{ padding: 16 }}>
              {lines.length === 0 && (
                <div style={{ fontSize: 13, color: '#888' }}>لم يُسجَّل بند لهذا اليوم بعد.</div>
              )}
              {lines.map((l, i) => (
                <div key={l.id || 'new' + i}
                     style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={l.item} style={{ flex: 1, minWidth: 200 }}
                          onChange={(e) => editLine(i, { item: e.target.value }, true)}>
                    <option value="">— اختر البند —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.description_ar}</option>
                    ))}
                  </select>
                  <select value={l.contractor} style={{ width: 170 }}
                          onChange={(e) => editLine(i, { contractor: e.target.value }, true)}>
                    <option value="">— المقاول —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name_ar}</option>
                    ))}
                  </select>
                  <input type="number" step="any" dir="ltr" placeholder="المنجز"
                         style={{ width: 110, textAlign: 'center' }} value={l.qty}
                         onChange={(e) => editLine(i, { qty: e.target.value })} />
                  <input placeholder="الوحدة" style={{ width: 85 }} value={l.unit}
                         onChange={(e) => editLine(i, { unit: e.target.value })} />
                  <button className="btn ghost" style={sm} onClick={() => removeLine(i)}>حذف</button>
                </div>
              ))}
              {lines.length > 0 && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                  البند والمنجز يُنسبان للمقاول المختار — فإن اشتغل مقاولان على البند نفسه، سجّل سطراً لكل منهما.
                </div>
              )}
            </div>
          </div>

          <div className="section">
            <header><h2>ملاحظات اليوم</h2></header>
            <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 260 }}>
                <label>تعقيدات وطلبات وأحداث</label>
                <input value={note} onChange={(e) => changeNote(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label>الآليات والمعدات</label>
                <input value={machinery} onChange={(e) => changeMachinery(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="section">
            <header><h2>وقائع اليوم</h2></header>
            {events.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: '#888' }}>
                لا وقائع مالية مسجّلة في هذا التاريخ.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', width: 120 }}>النوع</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>الجهة</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>البيان</th>
                    <th style={{ padding: '8px 10px', width: 120 }}>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 10px' }}>{e.kind_ar}</td>
                      <td style={{ padding: '6px 10px' }}>{e.party || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>{e.note || e.ref || '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr' }}>
                        {e.amount == null ? '—' : money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{
            display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
            margin: '4px 0 30px',
          }}>
            <button className="btn ghost" onClick={openDay}>تحديث من القاعدة</button>
            <span style={{ fontSize: 13 }}>الحاضرون: <b>{presentCount}</b></span>
            <span style={{ fontSize: 13 }}>
              قيمة اليوم: <b style={{ color: MAROON, direction: 'ltr' }}>{money(dayValue)}</b>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const sm = { padding: '3px 11px', fontSize: 12.5 };
