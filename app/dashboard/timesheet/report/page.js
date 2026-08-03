'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  الاستعراض الأسبوعي : الأيام تُدخل والأسابيع تُقرأ
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
  expense:    'مصروفات المقاول',
  claim:      'المستخلصات',
  settlement: 'تسويات المقاولين',
  material:   'المواد',
  output:     'الإنتاج',
};

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

  const [events, setEvents] = useState([]);
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
  const weeks = (() => {
    if (!from || !to || to < from) return [];
    const out = []; let cur = satOf(from); let guard = 0;
    while (cur <= to && guard++ < 120) { out.push(cur); cur = addDays(cur, 7); }
    return out;
  })();

  const quick = (n) => {
    const s = satOf(iso(new Date()));
    const start = addDays(s, -7 * (n - 1));
    setFrom(start); setTo(addDays(s, 5));
  };

  const run = useCallback(async () => {
    setLoading(true); setErr(''); setRan(true);
    try {
      if (kind === 'attendance') {
        const { data: days } = await supabase.from('timesheet_days')
          .select('id, work_date').eq('project_id', projectId)
          .gte('work_date', satOf(from)).lte('work_date', to);
        const ids = (days || []).map((d) => d.id);
        const dateOf = Object.fromEntries((days || []).map((d) => [d.id, d.work_date]));

        let marks = {}; const wmap = {};
        if (ids.length) {
          const { data: att } = await supabase.from('attendance')
            .select('day_id, status, amount, laborer_id, laborers(full_name, trade, labor_class, contractor_id)')
            .in('day_id', ids);
          (att || []).forEach((a) => {
            if (contractorId && a.laborers?.contractor_id !== contractorId) return;
            marks[`${a.laborer_id}|${dateOf[a.day_id]}`] = a.status;
            if (!wmap[a.laborer_id]) {
              wmap[a.laborer_id] = {
                id: a.laborer_id,
                name: a.laborers?.full_name || '—',
                trade: a.laborers?.trade || a.laborers?.labor_class || '',
              };
            }
          });
        }
        setGrid({ workers: Object.values(wmap), marks });
        setEvents([]);
      } else {
        const { data } = await supabase.from('v_day_events')
          .select('*').eq('project_id', projectId).eq('kind', kind)
          .gte('event_date', satOf(from)).lte('event_date', to)
          .order('event_date');
        const cname = contractors.find((c) => c.id === contractorId)?.name_ar;
        setEvents(cname ? (data || []).filter((r) => r.party === cname) : (data || []));
        setGrid({ workers: [], marks: {} });
      }
    } catch (e) {
      setErr('تعذّر التحميل: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, from, to, kind, contractorId, contractors]);

  const projName = projects.find((p) => p.id === projectId)?.name_ar || '';
  const ctrName = contractors.find((c) => c.id === contractorId)?.name_ar || '';
  const head = ctrName ? `${projName} — ${ctrName}` : projName;
  const pages = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += PER_PAGE) out.push(arr.slice(i, i + PER_PAGE));
    return out.length ? out : [[]];
  };
  const daysOf = (w) => Array.from({ length: 6 }, (_, i) => addDays(w, i));
  const inRange = (d) => d >= from && d <= to;

  const workerWeekDays = (wid, w) =>
    daysOf(w).filter(inRange)
      .reduce((t, d) => t + (ST[grid.marks[`${wid}|${d}`]]?.f ?? 0), 0);

  return (
    <div dir="rtl">
      <div className="page-head no-print">
        <div>
          <h1>الاستعراض الأسبوعي</h1>
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
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#777', alignSelf: 'center' }}>مدد سريعة:</span>
          <button className="btn ghost" style={sm} onClick={() => quick(1)}>هذا الأسبوع</button>
          <button className="btn ghost" style={sm} onClick={() => quick(2)}>أسبوعان</button>
          <button className="btn ghost" style={sm} onClick={() => quick(3)}>ثلاثة أسابيع</button>
          <button className="btn ghost" style={sm}
                  onClick={() => { const t = iso(new Date()); setFrom(t); setTo(t); }}>اليوم فقط</button>
          <span style={{ fontSize: 12.5, color: '#999', alignSelf: 'center' }}>
            {weeks.length ? `${weeks.length} أسبوعاً في المدى` : ''}
          </span>
        </div>
      </div>

      {err && <div className="msg err no-print">{err}</div>}

      {ran && kind === 'attendance' && grid.workers.length > 0 && weeks.map((w) =>
        pages(grid.workers).map((chunk, pi) => (
          <div key={w + pi} className="wk section" style={{ pageBreakAfter: 'always' }}>
            <header>
              <h2>{head} — أسبوع {w} إلى {addDays(w, 5)}</h2>
              <span style={{ fontSize: 12.5, color: '#777' }}>
                {pages(grid.workers).length > 1 ? `ورقة ${pi + 1} من ${pages(grid.workers).length}` : ''}
              </span>
            </header>
            <div style={{ overflowX: 'auto', padding: '0 4px 10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '7px 10px', minWidth: 150 }}>الاسم</th>
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
                      <td style={{ padding: '5px', textAlign: 'center', fontSize: 11.5, opacity: .8 }}>
                        {wk.trade}
                      </td>
                      {daysOf(w).map((d) => {
                        const st = grid.marks[`${wk.id}|${d}`];
                        const cfg = ST[st] || ST.absent;
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
          </div>
        ))
      )}

      {ran && kind !== 'attendance' && weeks.map((w) => {
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
      {ran && !loading && kind !== 'attendance' && events.length === 0 && (
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
