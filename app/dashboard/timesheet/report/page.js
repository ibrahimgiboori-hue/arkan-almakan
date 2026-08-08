'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  الاستعراض والطباعة : الأيام تُدخل والفترات تُقرأ
//  يقرأ من العروض المحسوبة : v_day_attendance و v_day_output
//  المسار : /dashboard/timesheet/report
// ============================================================

const MAROON = '#8B3332';
const PER_PAGE = 18;          // عدد العمال في ورقة الطباعة الواحدة

const ST = {
  full:    { s: 'ك', bg: '#E8F3EA', fg: '#2E6B3A', f: 1 },
  half:    { s: '½', bg: '#FDF3DF', fg: '#8A6100', f: 0.5 },
  absent:  { s: '−', bg: '#FBECEC', fg: '#A32B24', f: 0 },
  stopped: { s: 'ت', bg: '#EDF0F6', fg: '#3C4A6B', f: 1 },
  leave:   { s: 'إ', bg: '#F2EEF6', fg: '#5B4380', f: 0 },
};
const COLS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

const KINDS = {
  attendance: 'الحضور والغياب',
  output:     'الإنتاج اليومي',
  expense:    'مصروفات المقاول',
  claim:      'المستخلصات',
  settlement: 'تسويات المقاولين',
  material:   'المواد',
};
const EVENT_KINDS = ['expense', 'claim', 'settlement', 'material'];

const CLASS_AR = {
  worker: 'عمال', technician: 'صنايعية', foreman: 'مراقبون',
  driver: 'سائقون', engineer: 'مهندسون', helper: 'مساعدون', other: 'أخرى',
};
const clsAr = (c) => CLASS_AR[c] || c || 'أخرى';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const satOf = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return iso(d); };
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 });

export default function WeeklyReport() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [contractors, setContractors] = useState([]);
  const [contractorId, setContractorId] = useState('');
  const [from, setFrom] = useState(satOf(iso(new Date())));
  const [to, setTo] = useState(addDays(satOf(iso(new Date())), 5));
  const [kind, setKind] = useState('attendance');
  const [showAll, setShowAll] = useState(true);   // إظهار من لم يُسجَّل له حضور

  const [events, setEvents] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [grid, setGrid] = useState({ workers: [], marks: {} });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ran, setRan] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, project_no, name_ar').order('project_no')
      .then(({ data }) => setProjects(data || []));
    supabase.from('contractors').select('id, name_ar').eq('is_active', true).order('name_ar')
      .then(({ data }) => setContractors(data || []));
  }, []);

  // أسابيع المدى : تبدأ كلها من السبت
  const weeks = useMemo(() => {
    if (!from || !to || to < from) return [];
    const out = []; let cur = satOf(from); let guard = 0;
    while (cur <= to && guard++ < 120) { out.push(cur); cur = addDays(cur, 7); }
    return out;
  }, [from, to]);

  const quick = (n) => {
    const s = satOf(iso(new Date()));
    setFrom(addDays(s, -7 * (n - 1))); setTo(addDays(s, 5));
  };
  const thisMonth = () => {
    const d = new Date();
    setFrom(iso(new Date(d.getFullYear(), d.getMonth(), 1)));
    setTo(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
  };

  // ---------- التحميل ----------
  const run = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setErr(''); setRan(true);
    const lo = satOf(from), hi = to;
    try {
      if (kind === 'attendance') {
        let q = supabase.from('v_day_attendance')
          .select('laborer_id, laborer_name, trade, labor_class, contractor_id, contractor_name, work_date, status, rate_used')
          .eq('project_id', projectId).gte('work_date', lo).lte('work_date', hi);
        if (contractorId) q = q.eq('contractor_id', contractorId);
        const { data: att, error } = await q;
        if (error) throw error;

        const marks = {}; const wmap = {};
        (att || []).forEach((a) => {
          marks[`${a.laborer_id}|${a.work_date}`] = a.status;
          if (!wmap[a.laborer_id]) {
            wmap[a.laborer_id] = {
              id: a.laborer_id,
              name: a.laborer_name || '—',
              trade: a.trade || a.labor_class || '',
              cls: a.labor_class || 'other',
              rate: Number(a.rate_used || 0),
              contractor: a.contractor_name || '',
            };
          }
        });

        // كشف كامل : من لم يُسجَّل له حضور يظهر غائباً كما في الورقة
        if (showAll) {
          let cids = contractorId ? [contractorId] : null;
          if (!cids) {
            const { data: pc } = await supabase.from('project_contractors')
              .select('contractor_id').eq('project_id', projectId);
            cids = (pc || []).map((x) => x.contractor_id).filter(Boolean);
          }
          if (cids.length) {
            const { data: labs } = await supabase.from('laborers')
              .select('id, full_name, trade, labor_class, daily_rate, contractor_id')
              .in('contractor_id', cids).eq('is_active', true);
            const cname = Object.fromEntries(contractors.map((c) => [c.id, c.name_ar]));
            (labs || []).forEach((l) => {
              if (wmap[l.id]) return;
              wmap[l.id] = {
                id: l.id, name: l.full_name || '—',
                trade: l.trade || l.labor_class || '',
                cls: l.labor_class || 'other',
                rate: Number(l.daily_rate || 0),
                contractor: cname[l.contractor_id] || '',
              };
            });
          }
        }

        const workers = Object.values(wmap).sort((a, b) =>
          (a.contractor || '').localeCompare(b.contractor || '', 'ar') ||
          (a.cls || '').localeCompare(b.cls || '') ||
          (a.name || '').localeCompare(b.name || '', 'ar'));

        setGrid({ workers, marks });
        setEvents([]); setOutputs([]);
      } else if (kind === 'output') {
        let q = supabase.from('v_day_output')
          .select('work_date, item_description, unit, contractor_id, contractor_name, group_output, notes')
          .eq('project_id', projectId).gte('work_date', lo).lte('work_date', hi)
          .order('work_date');
        if (contractorId) q = q.eq('contractor_id', contractorId);
        const { data, error } = await q;
        if (error) throw error;
        setOutputs(data || []);
        setGrid({ workers: [], marks: {} }); setEvents([]);
      } else {
        const { data, error } = await supabase.from('v_day_events')
          .select('*').eq('project_id', projectId).eq('kind', kind)
          .gte('event_date', lo).lte('event_date', hi).order('event_date');
        if (error) throw error;
        const cname = contractors.find((c) => c.id === contractorId)?.name_ar;
        setEvents(cname ? (data || []).filter((r) => r.party === cname) : (data || []));
        setGrid({ workers: [], marks: {} }); setOutputs([]);
      }
    } catch (e) {
      setErr('تعذّر التحميل: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, from, to, kind, contractorId, contractors, showAll]);

  const projName = projects.find((p) => p.id === projectId)?.name_ar || '';
  const ctrName = contractors.find((c) => c.id === contractorId)?.name_ar || '';
  const head = ctrName ? `${projName} — ${ctrName}` : projName;

  const pages = useCallback((arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += PER_PAGE) out.push(arr.slice(i, i + PER_PAGE));
    return out.length ? out : [[]];
  }, []);
  const daysOf = (w) => Array.from({ length: 6 }, (_, i) => addDays(w, i));
  const inRange = (d) => d >= from && d <= to;

  const workerWeekDays = useCallback((wid, w) =>
    daysOf(w).filter(inRange)
      .reduce((t, d) => t + (ST[grid.marks[`${wid}|${d}`]]?.f ?? 0), 0),
    [grid.marks, from, to]);

  // ملخصات كل أسبوع تُحسب مرة واحدة لا في كل خلية
  const summaries = useMemo(() => {
    const out = {};
    weeks.forEach((w) => {
      const byCls = {}, byTrade = {};
      grid.workers.forEach((wk) => {
        const d = daysOf(w).filter(inRange)
          .reduce((t, dd) => t + (ST[grid.marks[`${wk.id}|${dd}`]]?.f ?? 0), 0);
        [[byCls, wk.cls || 'other'], [byTrade, wk.trade || '—']].forEach(([acc, key]) => {
          acc[key] = acc[key] || { key, people: 0, attended: 0, days: 0, value: 0 };
          acc[key].people += 1;
          if (d > 0) acc[key].attended += 1;
          acc[key].days += d;
          acc[key].value += d * Number(wk.rate || 0);
        });
      });
      const sort = (o) => Object.values(o).sort((a, b) => b.days - a.days);
      out[w] = { cls: sort(byCls), trade: sort(byTrade) };
    });
    return out;
  }, [weeks, grid, from, to]);

  const pageList = useMemo(() => pages(grid.workers), [grid.workers, pages]);

  return (
    <div dir="rtl">
      <div className="page-head no-print">
        <div>
          <h1>الاستعراض والطباعة</h1>
          <p>اختر المدى ونوع التقرير — كل أسبوع يخرج في ورقة مستقلة عند الطباعة</p>
        </div>
      </div>

      <div className="section no-print" style={{ marginTop: 0 }}>
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
          <div className="field" style={{ minWidth: 190 }}>
            <label>المقاول</label>
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">كل المقاولين</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>من</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>إلى</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 190 }}>
            <label>نوع التقرير</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn" onClick={run} disabled={!projectId || loading}>
            {loading ? 'جارٍ…' : 'استعراض'}
          </button>
          <button className="btn ghost" onClick={() => window.print()} disabled={!ran}>طباعة</button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: '#777' }}>مدد سريعة:</span>
          <button className="btn ghost" style={sm} onClick={() => quick(1)}>هذا الأسبوع</button>
          <button className="btn ghost" style={sm} onClick={() => quick(2)}>أسبوعان</button>
          <button className="btn ghost" style={sm} onClick={() => quick(4)}>أربعة أسابيع</button>
          <button className="btn ghost" style={sm} onClick={thisMonth}>هذا الشهر</button>
          <button className="btn ghost" style={sm}
                  onClick={() => { const t = iso(new Date()); setFrom(t); setTo(t); }}>اليوم فقط</button>
          {kind === 'attendance' && (
            <label style={{ fontSize: 12.5, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              إظهار من لم يُسجَّل له حضور (كشف كامل)
            </label>
          )}
          <span style={{ fontSize: 12.5, color: '#999' }}>
            {weeks.length ? `${weeks.length} أسبوعاً في المدى` : ''}
          </span>
        </div>
      </div>

      {err && <div className="msg err no-print">{err}</div>}

      {/* ============ الحضور والغياب ============ */}
      {ran && kind === 'attendance' && grid.workers.length > 0 && weeks.map((w) =>
        pageList.map((chunk, pi) => (
          <div key={w + '|' + pi} className="wk section" style={{ pageBreakAfter: 'always' }}>
            <header>
              <h2>{head} — أسبوع {w} إلى {addDays(w, 5)}</h2>
              <span style={{ fontSize: 12.5, color: '#777' }}>
                {pageList.length > 1 ? `ورقة ${pi + 1} من ${pageList.length}` : ''}
              </span>
            </header>
            <div style={{ overflowX: 'auto', padding: '0 4px 10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '7px 10px', minWidth: 150 }}>الاسم</th>
                    {!contractorId && <th style={{ padding: '7px 4px' }}>المقاول</th>}
                    <th style={{ padding: '7px 4px' }}>المهنة</th>
                    {daysOf(w).map((d, i) => (
                      <th key={d} style={{ padding: '5px 3px', minWidth: 56, opacity: inRange(d) ? 1 : .4 }}>
                        <div>{COLS[i]}</div>
                        <div style={{ fontSize: 10.5, opacity: .7, direction: 'ltr' }}>{d.slice(5)}</div>
                      </th>
                    ))}
                    <th style={{ padding: '7px 5px' }}>أيامه</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((wk) => (
                    <tr key={wk.id}>
                      <td style={{ padding: '5px 10px' }}>{wk.name}</td>
                      {!contractorId && (
                        <td style={{ padding: '5px', textAlign: 'center', fontSize: 11.5, opacity: .8 }}>
                          {wk.contractor}
                        </td>
                      )}
                      <td style={{ padding: '5px', textAlign: 'center', fontSize: 11.5, opacity: .8 }}>
                        {wk.trade}
                      </td>
                      {daysOf(w).map((d) => {
                        const cfg = ST[grid.marks[`${wk.id}|${d}`]] || ST.absent;
                        return (
                          <td key={d} style={{ padding: 2, textAlign: 'center', opacity: inRange(d) ? 1 : .35 }}>
                            <div style={{
                              padding: '5px 0', borderRadius: 4,
                              background: cfg.bg, color: cfg.fg, fontWeight: 500,
                            }}>{cfg.s}</div>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 500 }}>{workerWeekDays(wk.id, w)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td style={{ padding: '7px 10px' }}>مجموع الحاضرين</td>
                    {!contractorId && <td />}
                    <td />
                    {daysOf(w).map((d) => (
                      <td key={d} style={{ textAlign: 'center' }}>
                        {chunk.filter((wk) => ['full','half','stopped'].includes(grid.marks[`${wk.id}|${d}`])).length}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', color: MAROON }}>
                      {chunk.reduce((t, wk) => t + workerWeekDays(wk.id, w), 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {pi === pageList.length - 1 && (
              <div style={{ padding: '4px 10px 14px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: MAROON }}>
                  ملخص الأسبوع
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', padding: '6px 10px' }}>الفئة</th>
                      <th style={{ padding: '6px' }}>عدد الأفراد</th>
                      <th style={{ padding: '6px' }}>منهم حضر</th>
                      <th style={{ padding: '6px' }}>مجموع اليوميات</th>
                      <th style={{ padding: '6px' }}>القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summaries[w]?.cls || []).map((r) => (
                      <tr key={r.key}>
                        <td style={{ padding: '5px 10px' }}>{clsAr(r.key)}</td>
                        <td style={{ textAlign: 'center' }}>{r.people}</td>
                        <td style={{ textAlign: 'center' }}>{r.attended}</td>
                        <td style={{ textAlign: 'center', fontWeight: 500 }}>{r.days}</td>
                        <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(r.value)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                      <td style={{ padding: '6px 10px' }}>الإجمالي</td>
                      <td style={{ textAlign: 'center' }}>{grid.workers.length}</td>
                      <td style={{ textAlign: 'center' }}>
                        {(summaries[w]?.cls || []).reduce((t, r) => t + r.attended, 0)}
                      </td>
                      <td style={{ textAlign: 'center', color: MAROON }}>
                        {(summaries[w]?.cls || []).reduce((t, r) => t + r.days, 0)}
                      </td>
                      <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>
                        {money((summaries[w]?.cls || []).reduce((t, r) => t + r.value, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ fontSize: 12.5, fontWeight: 500, margin: '12px 0 6px', color: MAROON }}>
                  بحسب المهنة
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <tbody>
                    {(summaries[w]?.trade || []).map((r) => (
                      <tr key={r.key}>
                        <td style={{ padding: '5px 10px' }}>{r.key || '—'}</td>
                        <td style={{ textAlign: 'center', width: 110 }}>{r.attended} حضر</td>
                        <td style={{ textAlign: 'center', width: 130, fontWeight: 500 }}>{r.days} يومية</td>
                        <td style={{ textAlign: 'center', width: 130, direction: 'ltr' }}>{money(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {/* ============ الإنتاج اليومي ============ */}
      {ran && kind === 'output' && weeks.map((w) => {
        const rows = outputs.filter((r) => r.work_date >= w && r.work_date <= addDays(w, 5)
          && r.work_date >= from && r.work_date <= to);
        if (!rows.length) return null;
        const byItem = {};
        rows.forEach((r) => {
          const k = (r.item_description || '—') + '|' + (r.contractor_name || '—');
          byItem[k] = byItem[k] || {
            item: r.item_description || '—', contractor: r.contractor_name || '—',
            unit: r.unit || '', qty: 0,
          };
          byItem[k].qty += Number(r.group_output || 0);
        });
        return (
          <div key={w} className="wk section" style={{ pageBreakAfter: 'always' }}>
            <header>
              <h2>{head} — الإنتاج — أسبوع {w} إلى {addDays(w, 5)}</h2>
            </header>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', padding: '8px 10px', width: 110 }}>التاريخ</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>البند</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', width: 150 }}>المقاول</th>
                  <th style={{ padding: '8px 10px', width: 110 }}>المنجز</th>
                  <th style={{ padding: '8px 10px', width: 80 }}>الوحدة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 10px', direction: 'ltr' }}>{r.work_date}</td>
                    <td style={{ padding: '6px 10px' }}>{r.item_description || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{r.contractor_name || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr' }}>
                      {r.group_output == null ? '—' : money(r.group_output)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '10px 10px 14px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: MAROON }}>
                مجموع الأسبوع بحسب البند والمقاول
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <tbody>
                  {Object.values(byItem).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '5px 10px' }}>{r.item}</td>
                      <td style={{ padding: '5px 10px', width: 160 }}>{r.contractor}</td>
                      <td style={{ textAlign: 'center', width: 120, fontWeight: 500, direction: 'ltr' }}>
                        {money(r.qty)}
                      </td>
                      <td style={{ textAlign: 'center', width: 70 }}>{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ============ الوقائع المالية ============ */}
      {ran && EVENT_KINDS.includes(kind) && weeks.map((w) => {
        const rows = events.filter((e) => e.event_date >= w && e.event_date <= addDays(w, 5));
        if (!rows.length) return null;
        const total = rows.reduce((t, r) => t + Number(r.amount || 0), 0);
        return (
          <div key={w} className="wk section" style={{ pageBreakAfter: 'always' }}>
            <header>
              <h2>{head} — {KINDS[kind]} — أسبوع {w} إلى {addDays(w, 5)}</h2>
            </header>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', padding: '8px 10px', width: 110 }}>التاريخ</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>الجهة</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>المرجع</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>البيان</th>
                  <th style={{ padding: '8px 10px', width: 120 }}>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 10px', direction: 'ltr' }}>{r.event_date}</td>
                    <td style={{ padding: '6px 10px' }}>{r.party || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{r.ref || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{r.note || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr' }}>
                      {r.amount == null ? '—' : money(r.amount)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                  <td colSpan={4} style={{ padding: '8px 10px' }}>إجمالي الأسبوع</td>
                  <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>{money(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {ran && !loading && kind === 'attendance' && grid.workers.length === 0 && (
        <div className="empty"><h3>لا حضور مسجّل في هذا المدى</h3>
          <p>غيّر التواريخ أو أدخل الأيام أولاً.</p></div>
      )}
      {ran && !loading && kind === 'output' && outputs.length === 0 && (
        <div className="empty"><h3>لا إنتاج مسجّل في هذا المدى</h3>
          <p>سجّل البند والمنجز في شاشة اليوم أو شاشة الأسبوع.</p></div>
      )}
      {ran && !loading && EVENT_KINDS.includes(kind) && events.length === 0 && (
        <div className="empty"><h3>لا سجلات من نوع {KINDS[kind]} في هذا المدى</h3></div>
      )}

      <style jsx global>{`
        @media print {
          .no-print, aside, nav, header.app-head { display: none !important; }
          .wk { page-break-after: always; break-inside: avoid; }
          .wk:last-child { page-break-after: auto; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  );
}

const sm = { padding: '3px 11px', fontSize: 12.5 };
