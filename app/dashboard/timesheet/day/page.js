'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  صفحة اليوم : كل ما حدث في هذا التاريخ لهذا المشروع
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
const iso = (d) => d.toISOString().slice(0, 10);
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
  const [lines, setLines] = useState([]);         // بنود اليوم وإنتاجها
  const [note, setNote] = useState('');
  const [machinery, setMachinery] = useState('');
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    // استقبال المشروع والتاريخ من الرابط عند القدوم من قائمة الأيام
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

  const openDay = useCallback(async () => {
    if (!projectId || !date) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      // مقاولو المشروع وعمالهم
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

      // اليوم
      const { data: day } = await supabase.from('timesheet_days')
        .select('id, notes, machinery').eq('project_id', projectId)
        .eq('work_date', date).maybeSingle();

      const m = {};
      if (day) {
        setDayId(day.id); setNote(day.notes || ''); setMachinery(day.machinery || '');
        const { data: att } = await supabase.from('attendance')
          .select('laborer_id, status').eq('day_id', day.id);
        (att || []).forEach((a) => { m[a.laborer_id] = a.status; });
        const { data: di } = await supabase.from('day_items')
          .select('project_item_id, group_output, unit').eq('day_id', day.id);
        setLines((di || []).map((x) => ({
          item: x.project_item_id || '', qty: x.group_output ?? '', unit: x.unit || '',
        })));
      } else {
        setDayId(null); setNote(''); setMachinery(''); setLines([]);
      }
      setMarks(m);

      const { data: ev } = await supabase.from('v_day_events')
        .select('*').eq('project_id', projectId).eq('event_date', date);
      setEvents(ev || []);
      setMsg('');
    } catch (e) {
      setErr('تعذّر فتح اليوم: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, date]);

  useEffect(() => { if (projectId && date) openDay(); }, [projectId, date, openDay]);

  const cycle = (lid) => {
    const cur = marks[lid] || DEF;
    setMarks((m) => ({ ...m, [lid]: CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length] }));
  };
  const setGroup = (g, st) =>
    setMarks((m) => { const n = { ...m }; g.workers.forEach((w) => { n[w.id] = st; }); return n; });

  async function save() {
    setBusy(true); setErr(''); setMsg('');
    try {
      let id = dayId;
      if (!id) {
        const ins = await supabase.from('timesheet_days')
          .insert({ project_id: projectId, work_date: date, notes: note, machinery })
          .select('id').single();
        if (ins.error) throw ins.error;
        id = ins.data.id; setDayId(id);
      } else {
        await supabase.from('timesheet_days')
          .update({ notes: note, machinery }).eq('id', id);
      }

      const rows = [];
      groups.forEach((g) => g.workers.forEach((w) => {
        const st = marks[w.id] || DEF;
        const rate = Number(w.daily_rate || 0);
        rows.push({
          day_id: id, laborer_id: w.id, status: st,
          rate_used: rate, amount: Math.round(rate * STATUS[st].factor * 100) / 100,
        });
      }));
      await supabase.from('attendance').delete().eq('day_id', id);
      if (rows.length) {
        const { error } = await supabase.from('attendance').insert(rows);
        if (error) throw error;
      }

      await supabase.from('day_items').delete().eq('day_id', id);
      const dis = lines.filter((l) => l.item).map((l) => ({
        day_id: id, project_item_id: l.item,
        group_output: l.qty === '' ? null : Number(l.qty),
        unit: l.unit || null,
      }));
      if (dis.length) {
        const { error } = await supabase.from('day_items').insert(dis);
        if (error) throw error;
      }

      setMsg('حُفظ يوم ' + date);
      openDay();
    } catch (e) {
      setErr('تعذّر الحفظ: ' + (e.message || e));
    }
    setBusy(false);
  }

  const dayValue = groups.reduce((t, g) => t + g.workers.reduce((s, w) =>
    s + Number(w.daily_rate || 0) * STATUS[marks[w.id] || DEF].factor, 0), 0);
  const presentCount = groups.reduce((t, g) => t + g.workers
    .filter((w) => ['full','half','stopped'].includes(marks[w.id] || DEF)).length, 0);
  const dt = new Date(date + 'T00:00:00');

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>يوم العمل</h1>
          <p>كل ما حدث في هذا التاريخ — حضور كل المقاولين والإنتاج والوقائع</p>
        </div>
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
          {!dayId && projectId && <span style={{ fontSize: 12.5, color: '#8A6100' }}>يوم جديد</span>}
        </div>
      </div>

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}
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
                <button key={w.id} type="button" onClick={() => cycle(w.id)}
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
              <button className="btn ghost" style={sm}
                      onClick={() => setLines((l) => [...l, { item: '', qty: '', unit: '' }])}>
                إضافة بند
              </button>
            </header>
            <div style={{ padding: 16 }}>
              {lines.length === 0 && (
                <div style={{ fontSize: 13, color: '#888' }}>لم يُسجَّل بند لهذا اليوم بعد.</div>
              )}
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select value={l.item} style={{ flex: 1 }}
                          onChange={(e) => setLines((x) =>
                            x.map((y, j) => j === i ? { ...y, item: e.target.value } : y))}>
                    <option value="">— اختر البند —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.description_ar}</option>
                    ))}
                  </select>
                  <input type="number" step="any" dir="ltr" placeholder="المنجز"
                         style={{ width: 120, textAlign: 'center' }} value={l.qty}
                         onChange={(e) => setLines((x) =>
                           x.map((y, j) => j === i ? { ...y, qty: e.target.value } : y))} />
                  <input placeholder="الوحدة" style={{ width: 90 }} value={l.unit}
                         onChange={(e) => setLines((x) =>
                           x.map((y, j) => j === i ? { ...y, unit: e.target.value } : y))} />
                  <button className="btn ghost" style={sm}
                          onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>حذف</button>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <header><h2>ملاحظات اليوم</h2></header>
            <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 260 }}>
                <label>تعقيدات وطلبات وأحداث</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 200 }}>
                <label>الآليات والمعدات</label>
                <input value={machinery} onChange={(e) => setMachinery(e.target.value)} />
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
            <button className="btn" onClick={save} disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ اليوم'}
            </button>
            <span style={{ fontSize: 13 }}>
              الحاضرون: <b>{presentCount}</b>
            </span>
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
