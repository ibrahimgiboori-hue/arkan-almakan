'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  شاشة الأسبوع : أفراد × أيام
//  الأصل غياب — لا يُحتسب حاضراً إلا من تحضره أنت
//  اليوم هو المحور : يوم واحد للمشروع في كل تاريخ
//  الأسبوع محسوب من التاريخ ولا يُنشأ ولا يُخزَّن
//  الحفظ تلقائي مع كل تغيير — لا زر حفظ
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
const CYCLE = ['absent', 'full', 'half'];
const DEFAULT_ST = 'absent';

const DAY_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// أسبوع أركان : السبت → الخميس (ستة أيام)
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

// سبت الأسبوع الذي يقع فيه أي تاريخ — نفس منطق arkan_week_start في القاعدة
function weekStartOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return iso(d);
}
const lastSaturday = () => weekStartOf(iso(new Date()));

function shiftWeek(startISO, weeks) {
  const d = new Date(startISO + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
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

  const [weekRows, setWeekRows] = useState([]);   // أسابيع المشروع المستنتجة من الأيام
  const [opened, setOpened] = useState(false);
  const [dayIds, setDayIds] = useState({});       // تاريخ → معرّف اليوم
  const [marks, setMarks] = useState({});         // "laborerId|تاريخ" → حالة
  const [output, setOutput] = useState({});       // تاريخ → إنتاج المقاول
  const [itemOf, setItemOf] = useState({});       // تاريخ → بند
  const [dayNote, setDayNote] = useState({});     // تاريخ → ملاحظة اليوم (مشتركة)

  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [err, setErr] = useState('');

  const days = weekDays(start);

  // مراجع تتجاوز مشكلة الإغلاق القديم أثناء الحفظ التلقائي
  const dayIdRef  = useRef({});
  const chainRef  = useRef(Promise.resolve());
  const timersRef = useRef({});

  // ---------- التحميل الأولي ----------
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

  const nameOf = (cid) => contractors.find((c) => c.id === cid)?.name_ar || 'مقاول';

  // ---------- أسابيع المشروع : مستنتجة من الأيام لا من جدول ----------
  const loadWeeks = useCallback(async (pid) => {
    if (!pid) { setWeekRows([]); return; }
    const [d, t] = await Promise.all([
      supabase.from('timesheet_days').select('work_date').eq('project_id', pid),
      supabase.from('v_week_totals')
        .select('week_start, contractor_id, days_worked, laborers_count, works_amount')
        .eq('project_id', pid),
    ]);
    const starts = new Set((d.data || []).map((x) => weekStartOf(x.work_date)));
    (t.data || []).forEach((x) => x.week_start && starts.add(x.week_start));

    const rows = [...starts].sort().reverse().map((ws) => ({
      week_start: ws,
      week_end: shiftWeek(ws, 0) && iso(new Date(new Date(ws + 'T00:00:00').setDate(new Date(ws + 'T00:00:00').getDate() + 5))),
      parts: (t.data || []).filter((x) => x.week_start === ws && x.contractor_id),
    }));
    setWeekRows(rows);
  }, []);

  useEffect(() => { loadWeeks(projectId); }, [projectId, loadWeeks]);

  // ---------- فتح الأسبوع ----------
  const openWeek = useCallback(async (cidArg, stArg) => {
    const cid = cidArg || contractorId;
    const st  = stArg  || start;
    if (!projectId || !cid) return;
    const dys = weekDays(st);

    if (cidArg) setContractorId(cidArg);
    if (stArg)  setStart(stArg);

    setErr(''); setLoading(true); setOpened(false);
    setDayIds({}); setMarks({}); setOutput({}); setItemOf({}); setDayNote({});
    dayIdRef.current = {};

    try {
      // عمالة المقاول
      const { data: labs, error: le } = await supabase
        .from('laborers')
        .select('id, full_name, labor_class, trade, daily_rate, group_code')
        .eq('contractor_id', cid).eq('is_active', true)
        .order('labor_class').order('full_name');
      if (le) throw le;
      setLaborers(labs || []);

      // أيام هذا الأسبوع الموجودة فعلاً — لا نُنشئ شيئاً قبل أول إدخال
      const { data: existing, error: de } = await supabase.from('timesheet_days')
        .select('id, work_date, notes')
        .eq('project_id', projectId)
        .gte('work_date', dys[0]).lte('work_date', dys[dys.length - 1]);
      if (de) throw de;

      const map = {}, notes = {};
      (existing || []).forEach((d) => { map[d.work_date] = d.id; notes[d.work_date] = d.notes || ''; });
      dayIdRef.current = map;
      setDayIds(map); setDayNote(notes);

      const ids = Object.values(map);
      const dateOf = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
      const labIds = (labs || []).map((l) => l.id);

      // الحضور — لعمال هذا المقاول وحدهم
      const m = {};
      if (ids.length && labIds.length) {
        const { data: att } = await supabase.from('attendance')
          .select('day_id, laborer_id, status')
          .in('day_id', ids).in('laborer_id', labIds);
        (att || []).forEach((a) => { m[`${a.laborer_id}|${dateOf[a.day_id]}`] = a.status; });
      }
      (labs || []).forEach((l) => {
        dys.forEach((d) => { if (!m[`${l.id}|${d}`]) m[`${l.id}|${d}`] = DEFAULT_ST; });
      });
      setMarks(m);

      // البند والإنتاج — لهذا المقاول وحده
      const o = {}, it = {};
      if (ids.length) {
        const { data: di } = await supabase.from('day_items')
          .select('day_id, project_item_id, group_output')
          .in('day_id', ids).eq('contractor_id', cid);
        (di || []).forEach((x) => {
          const d = dateOf[x.day_id];
          if (!d) return;
          o[d] = x.group_output ?? ''; it[d] = x.project_item_id || '';
        });
      }
      setOutput(o); setItemOf(it);

      setOpened(true);
      await loadWeeks(projectId);
    } catch (e) {
      setErr('تعذّر فتح الأسبوع: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, contractorId, start, loadWeeks]);

  // ---------- محرك الحفظ التلقائي ----------
  // كل عملية تدخل طابوراً متسلسلاً حتى لا تتزاحم الكتابات
  const runSave = useCallback((fn) => {
    setSaveState('saving');
    chainRef.current = chainRef.current
      .then(fn)
      .then(() => setSaveState('saved'))
      .catch((e) => { setErr('تعذّر الحفظ: ' + (e.message || e)); setSaveState('error'); });
    return chainRef.current;
  }, []);

  // يُنشئ يوم المشروع عند أول إدخال فيه فقط
  const ensureDay = useCallback(async (d) => {
    if (dayIdRef.current[d]) return dayIdRef.current[d];
    const { data, error } = await supabase.rpc('fn_get_or_create_day', {
      p_project_id: projectId, p_date: d,
    });
    if (error) throw error;
    dayIdRef.current = { ...dayIdRef.current, [d]: data };
    setDayIds(dayIdRef.current);
    return data;
  }, [projectId]);

  // حضور خلية واحدة — لا يمس أي مقاول آخر في اليوم نفسه
  const persistMark = useCallback((lab, d, st) => runSave(async () => {
    const dayId = await ensureDay(d);
    const { error } = await supabase.from('attendance').upsert({
      day_id: dayId,
      laborer_id: lab.id,
      status: st,
      rate_used: Number(lab.daily_rate || 0),
    }, { onConflict: 'day_id,laborer_id' });
    if (error) throw error;
  }), [runSave, ensureDay]);

  // بند اليوم وإنتاجه — سطر واحد لهذا المقاول في هذا اليوم
  const persistDayItem = useCallback((d, itemId, qty) => runSave(async () => {
    const dayId = await ensureDay(d);
    await supabase.from('day_items')
      .delete().eq('day_id', dayId).eq('contractor_id', contractorId);
    if (itemId) {
      const { error } = await supabase.from('day_items').insert({
        day_id: dayId,
        project_item_id: itemId,
        contractor_id: contractorId,
        group_output: qty === '' || qty == null ? null : Number(qty),
      });
      if (error) throw error;
    }
  }), [runSave, ensureDay, contractorId]);

  const persistNote = useCallback((d, text) => runSave(async () => {
    const dayId = await ensureDay(d);
    const { error } = await supabase.from('timesheet_days')
      .update({ notes: text || null }).eq('id', dayId);
    if (error) throw error;
  }), [runSave, ensureDay]);

  // تأخير قصير لحقول الكتابة حتى لا نحفظ عند كل حرف
  const debounce = useCallback((key, fn, ms = 700) => {
    clearTimeout(timersRef.current[key]);
    setSaveState('saving');
    timersRef.current[key] = setTimeout(fn, ms);
  }, []);

  useEffect(() => () => Object.values(timersRef.current).forEach(clearTimeout), []);

  // ---------- التبديل ----------
  const cycle = (lab, d) => {
    const cur = marks[`${lab.id}|${d}`] || DEFAULT_ST;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setMarks((m) => ({ ...m, [`${lab.id}|${d}`]: next }));
    persistMark(lab, d, next);
  };

  const setMany = (pairs) => {
    setMarks((m) => {
      const n = { ...m };
      pairs.forEach(([lab, d, st]) => { n[`${lab.id}|${d}`] = st; });
      return n;
    });
    runSave(async () => {
      const byDate = {};
      pairs.forEach(([lab, d, st]) => { (byDate[d] = byDate[d] || []).push([lab, st]); });
      for (const d of Object.keys(byDate)) {
        const dayId = await ensureDay(d);
        const rows = byDate[d].map(([lab, st]) => ({
          day_id: dayId, laborer_id: lab.id, status: st,
          rate_used: Number(lab.daily_rate || 0),
        }));
        const { error } = await supabase.from('attendance')
          .upsert(rows, { onConflict: 'day_id,laborer_id' });
        if (error) throw error;
      }
    });
  };

  const setColumn = (d, st) => setMany(laborers.map((l) => [l, d, st]));
  const setRow    = (lab, st) => setMany(days.map((d) => [lab, d, st]));
  const setAll    = (st) => setMany(laborers.flatMap((l) => days.map((d) => [l, d, st])));

  const changeItem = (d, itemId) => {
    setItemOf((x) => ({ ...x, [d]: itemId }));
    persistDayItem(d, itemId, output[d] ?? '');
  };
  const changeOutput = (d, val) => {
    setOutput((x) => ({ ...x, [d]: val }));
    debounce('out|' + d, () => persistDayItem(d, itemOf[d] || '', val));
  };
  const changeNote = (d, val) => {
    setDayNote((x) => ({ ...x, [d]: val }));
    debounce('note|' + d, () => persistNote(d, val));
  };

  // ---------- الإجماليات ----------
  const dayTotal = (d) =>
    laborers.reduce((t, l) =>
      t + Number(l.daily_rate || 0) * STATUS[marks[`${l.id}|${d}`] || DEFAULT_ST].factor, 0);
  const weekTotal = days.reduce((t, d) => t + dayTotal(d), 0);
  const presentOn = (d) =>
    laborers.filter((l) => ['full','half','stopped'].includes(marks[`${l.id}|${d}`] || DEFAULT_ST)).length;

  const saveLabel = {
    idle: '', saving: 'جارٍ الحفظ…', saved: 'محفوظ', error: 'لم يُحفظ',
  }[saveState];
  const saveColor = { saved: '#2E6B3A', saving: '#8A6100', error: '#A32B24' }[saveState] || '#999';

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>التايم شيت الأسبوعي</h1>
          <p>الأصل غياب — لا يُحتسب حاضراً إلا من تحضره أنت. الحفظ تلقائي.</p>
        </div>
        {opened && (
          <span style={{ fontSize: 12.5, color: saveColor, fontWeight: 500 }}>{saveLabel}</span>
        )}
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>المشروع</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setOpened(false); }}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>المقاول</label>
            <select value={contractorId} onChange={(e) => { setContractorId(e.target.value); setOpened(false); }}>
              <option value="">— اختر —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>بداية الأسبوع (السبت)</label>
            <input type="date" value={start}
                   onChange={(e) => { setStart(weekStartOf(e.target.value)); setOpened(false); }} />
          </div>
          <button className="btn" onClick={() => openWeek()}
                  disabled={!projectId || !contractorId || loading}>
            {loading ? 'جارٍ…' : 'فتح الأسبوع'}
          </button>
          {opened && (
            <>
              <button className="btn ghost" onClick={() => openWeek(contractorId, shiftWeek(start, -1))}>
                الأسبوع السابق
              </button>
              <button className="btn ghost" onClick={() => openWeek(contractorId, shiftWeek(start, 1))}>
                الأسبوع التالي
              </button>
            </>
          )}
        </div>
      </div>

      {projectId && weekRows.length > 0 && (
        <div className="section">
          <header>
            <h2>أسابيع المشروع ({weekRows.length})</h2>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              محسوبة من الأيام المسجّلة — اختر الأسبوع ثم المقاول
            </span>
          </header>
          <div style={{ padding: '4px 16px 14px' }}>
            {weekRows.map((w) => (
              <div key={w.week_start} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 0', borderBottom: '1px solid #f0eded',
              }}>
                <div style={{ minWidth: 190 }}>
                  <span style={{ fontSize: 11.5, color: '#888', direction: 'ltr', display: 'inline-block' }}>
                    {w.week_start} → {w.week_end}
                  </span>
                </div>
                {w.parts.length === 0 && (
                  <button type="button" onClick={() => openWeek(contractorId, w.week_start)}
                          style={pill(start === w.week_start)}>
                    فتح الأسبوع
                  </button>
                )}
                {w.parts.map((p) => (
                  <button key={p.contractor_id} type="button"
                          onClick={() => openWeek(p.contractor_id, w.week_start)}
                          style={pill(start === w.week_start && contractorId === p.contractor_id)}>
                    {nameOf(p.contractor_id)}
                    <span style={{ fontSize: 11, opacity: .65, marginInlineStart: 6 }}>
                      {p.days_worked} أيام
                    </span>
                  </button>
                ))}
                {w.parts.length > 1 && (
                  <span style={{ fontSize: 11.5, color: '#999' }}>{w.parts.length} مقاولين</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}

      {opened && laborers.length > 0 && (
        <>
          <div className="section">
            <header>
              <h2>الحضور — {nameOf(contractorId)}</h2>
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
                          <button type="button" onClick={() => setColumn(d, 'full')} style={miniBtn}>حضور الكل</button>
                          <button type="button" onClick={() => setColumn(d, 'absent')} style={miniBtn}>تصفير</button>
                        </th>
                      );
                    })}
                    <th style={{ padding: '8px 6px' }}>أيامه</th>
                  </tr>
                </thead>
                <tbody>
                  {laborers.map((l) => {
                    const mine = days.reduce((t, d) =>
                      t + STATUS[marks[`${l.id}|${d}`] || DEFAULT_ST].factor, 0);
                    return (
                      <tr key={l.id}>
                        <td style={{ padding: '6px 10px' }}>
                          <div>{l.full_name}</div>
                          <button type="button" onClick={() => setRow(l, 'full')} style={miniBtn}>
                            حاضر كل الأسبوع
                          </button>
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center', fontSize: 12, opacity: .8 }}>
                          {l.trade || l.labor_class || '—'}
                        </td>
                        {days.map((d) => {
                          const st = marks[`${l.id}|${d}`] || DEFAULT_ST;
                          return (
                            <td key={d} style={{ padding: 3, textAlign: 'center' }}>
                              <button type="button" onClick={() => cycle(l, d)} title={STATUS[st].ar}
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
            <header>
              <h2>البند والإنتاج اليومي</h2>
              <span style={{ fontSize: 12.5, color: '#777' }}>
                البند والمنجز يخصّان هذا المقاول — وملاحظة اليوم مشتركة بين الجميع
              </span>
            </header>
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
                                  onChange={(e) => changeItem(d, e.target.value)}>
                            <option value="">— بلا بند —</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>{it.description_ar}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input type="number" step="any" dir="ltr"
                                 style={{ width: '100%', textAlign: 'center' }}
                                 value={output[d] ?? ''}
                                 onChange={(e) => changeOutput(d, e.target.value)} />
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <input value={dayNote[d] || ''} style={{ width: '100%' }}
                                 onChange={(e) => changeNote(d, e.target.value)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '4px 0 30px' }}>
            <button className="btn ghost" onClick={() => setAll('absent')}>
              تصفير الأسبوع (الكل غياب)
            </button>
            <button className="btn ghost" onClick={() => openWeek()}>
              تحديث من القاعدة
            </button>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              كل تغيير يُحفظ فور وقوعه، ولا يمس عمال المقاولين الآخرين في اليوم نفسه
            </span>
          </div>
        </>
      )}

      {opened && laborers.length === 0 && (
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

function pill(on) {
  return {
    fontSize: 12.5, padding: '4px 12px', cursor: 'pointer', borderRadius: 5,
    background: '#fff', border: '1px solid ' + (on ? MAROON : '#ddd'),
    color: on ? MAROON : '#444',
  };
}
