'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  إدخال بحسب العامل : تختار الفرد فترى كل أسابيعه دفعة واحدة
//  المسار : /dashboard/timesheet/worker
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

const COLS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (isoStr, n) => {
  const d = new Date(isoStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d);
};
// السبت الواقع في التاريخ أو قبله
const satOnOrBefore = (isoStr) => {
  const d = new Date(isoStr + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return iso(d);
};

export default function TimesheetByWorker() {
  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [laborers, setLaborers] = useState([]);

  const [projectId, setProjectId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [assigns, setAssigns] = useState([]);   // إسنادات البنود الجاهزة للتنفيذ
  const [itemId, setItemId] = useState('');
  const [search, setSearch] = useState('');
  const [worker, setWorker] = useState(null);

  const [weekStarts, setWeekStarts] = useState([]);   // قائمة سبوت
  const [dayIds, setDayIds] = useState({});           // تاريخ → معرّف اليوم
  const [marks, setMarks] = useState({});             // تاريخ → حالة

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from('projects').select('id, project_no, name_ar, start_date').order('project_no'),
        supabase.from('contractors').select('id, name_ar').eq('is_active', true).order('name_ar'),
      ]);
      setProjects(p.data || []); setContractors(c.data || []);
    })();
  }, []);

  useEffect(() => {
    setItemId(''); setContractorId(''); setWorker(null); setMarks({});
    if (!projectId) { setAssigns([]); return; }
    supabase.from('v_item_assignments')
      .select('project_item_id, item_name, contractor_id, contractor_name, mode_ar, is_active')
      .eq('project_id', projectId)
      .then(({ data }) => setAssigns((data || []).filter((a) => a.is_active !== false)));
  }, [projectId]);

  useEffect(() => {
    setWorker(null); setMarks({}); setWeekStarts([]);
    if (!contractorId) { setLaborers([]); return; }
    supabase.from('laborers')
      .select('id, full_name, labor_class, trade, daily_rate, iqama_no')
      .eq('contractor_id', contractorId).eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setLaborers(data || []));
  }, [contractorId]);

  // البنود التي عليها قرار تنفيذ فقط
  const itemsReady = Object.values(
    assigns.reduce((acc, a) => {
      acc[a.project_item_id] = acc[a.project_item_id] ||
        { id: a.project_item_id, name: a.item_name };
      return acc;
    }, {})
  );
  // مقاولو البند المختار
  const itemContractors = Object.values(
    assigns.filter((a) => !itemId || a.project_item_id === itemId)
      .reduce((acc, a) => {
        if (a.contractor_id) acc[a.contractor_id] =
          { id: a.contractor_id, name: a.contractor_name, mode: a.mode_ar };
        return acc;
      }, {})
  );

  // ---------- فتح ملف العامل ----------
  const openWorker = useCallback(async (w) => {
    if (!projectId) { setErr('اختر المشروع أولاً — الحضور يُسجَّل في مشروع محدد'); return; }
    setErr(''); setMsg(''); setLoading(true); setWorker(w);
    try {
      // أيام المشروع المسجّلة
      const { data: dys } = await supabase.from('timesheet_days')
        .select('id, work_date').eq('project_id', projectId).order('work_date');

      const proj = projects.find((p) => p.id === projectId);
      const firstDate = (dys && dys.length ? dys[0].work_date : null)
        || proj?.start_date || iso(new Date());

      const starts = [];
      let cur = satOnOrBefore(firstDate);
      const stop = satOnOrBefore(iso(new Date()));
      let guard = 0;
      while (cur <= stop && guard++ < 260) { starts.push(cur); cur = addDays(cur, 7); }
      setWeekStarts(starts);

      const dmap = {}; const m = {};
      (dys || []).forEach((d) => { dmap[d.work_date] = d.id; });

      const dayIdList = Object.values(dmap);
      if (dayIdList.length) {
        const { data: att } = await supabase.from('attendance')
          .select('day_id, status').eq('laborer_id', w.id).in('day_id', dayIdList);
        const dateOf = Object.fromEntries(Object.entries(dmap).map(([k, v]) => [v, k]));
        (att || []).forEach((a) => { m[dateOf[a.day_id]] = a.status; });
      }
      setDayIds(dmap); setMarks(m);
      setMsg(`${w.full_name} — ${starts.length} أسبوعاً منذ ${starts[0]}`);
    } catch (e) {
      setErr('تعذّر الفتح: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, projects]);

  const cycle = (d) => {
    const cur = marks[d] || DEF;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    setMarks((m) => ({ ...m, [d]: next }));
    marksRef.current = { ...marksRef.current, [d]: next };
    queue([d]);
  };
  const setWeek = (sd, st) => {
    const dates = Array.from({ length: 6 }, (_, i) => addDays(sd, i));
    setMarks((m) => {
      const n = { ...m }; dates.forEach((d) => { n[d] = st; }); return n;
    });
    marksRef.current = { ...marksRef.current };
    dates.forEach((d) => { marksRef.current[d] = st; });
    queue(dates);
  };

  // ---------- الحفظ التلقائي ----------
  const pending = useRef(new Set());
  const timer = useRef(null);
  const [sync, setSync] = useState('idle');   // idle | saving | saved | error

  const flush = useCallback(async () => {
    if (!worker) return;
    if (!projectId) { setErr('اختر المشروع أولاً'); setSync('error'); return; }
    const dates = Array.from(pending.current);
    pending.current = new Set();
    if (!dates.length) return;

    setSync('saving');
    try {
      const rate = Number(worker.daily_rate || 0);
      const dmap = { ...dayIds };

      for (const d of dates) {
        // اليوم يُنشأ عند الحاجة — بلا أسبوع
        if (!dmap[d]) {
          const { data: found } = await supabase.from('timesheet_days')
            .select('id').eq('project_id', projectId).eq('work_date', d).maybeSingle();
          if (found) dmap[d] = found.id;
          else {
            const ins = await supabase.from('timesheet_days')
              .insert({ project_id: projectId, work_date: d })
              .select('id').single();
            if (ins.error) throw ins.error;
            dmap[d] = ins.data.id;
          }
        }
        // ربط اليوم بالبند المختار (بلا تكرار)
        if (itemId) {
          const { data: has } = await supabase.from('day_items')
            .select('id').eq('day_id', dmap[d]).eq('project_item_id', itemId).maybeSingle();
          if (!has) await supabase.from('day_items')
            .insert({ day_id: dmap[d], project_item_id: itemId });
        }

        const st = marksRef.current[d] || DEF;
        await supabase.from('attendance')
          .delete().eq('laborer_id', worker.id).eq('day_id', dmap[d]);
        const { error } = await supabase.from('attendance').insert({
          day_id: dmap[d], laborer_id: worker.id, status: st, rate_used: rate,
        });
        if (error) throw error;
      }

      setDayIds(dmap);
      setSync('saved');
      setTimeout(() => setSync((x) => (x === 'saved' ? 'idle' : x)), 1800);
    } catch (e) {
      setErr('تعذّر الحفظ: ' + (e.message || e));
      setSync('error');
    }
  }, [worker, dayIds, projectId, itemId]);

  const marksRef = useRef({});
  useEffect(() => { marksRef.current = marks; }, [marks]);

  const queue = (dates) => {
    dates.forEach((d) => pending.current.add(d));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, 700);
  };

  const shown = laborers.filter((l) =>
    !search || (l.full_name || '').includes(search) || (l.iqama_no || '').includes(search));

  const weekDaysCount = (sd) =>
    Array.from({ length: 6 }, (_, i) => STATUS[marks[addDays(sd, i)] || DEF].factor)
      .reduce((a, b) => a + b, 0);
  const totalDays = weekStarts.reduce((t, sd) => t + weekDaysCount(sd), 0);
  const totalAmount = totalDays * Number(worker?.daily_rate || 0);

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>التايم شيت بحسب العامل</h1>
          <p>اختر الفرد فتظهر كل أسابيعه من بداية المشروع حتى اليوم في شاشة واحدة</p>
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
          <div className="field" style={{ minWidth: 230 }}>
            <label>البند الجاهز للتنفيذ</label>
            <select value={itemId} disabled={!projectId}
                    onChange={(e) => { setItemId(e.target.value); setContractorId(''); }}>
              <option value="">— اختر —</option>
              {itemsReady.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
            {projectId && itemsReady.length === 0 && (
              <span className="hint" style={{ color: '#8A6100' }}>
                لا بند عليه قرار تنفيذ في هذا المشروع
              </span>
            )}
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>المقاول</label>
            <select value={contractorId} disabled={!itemId}
                    onChange={(e) => setContractorId(e.target.value)}>
              <option value="">— اختر —</option>
              {itemContractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.mode ? ` — ${c.mode}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label>ابحث عن العامل بالاسم أو رقم الإقامة</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="اكتب أول حروف الاسم…" />
          </div>
        </div>

        {projectId && !itemId && (
          <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#8A6100' }}>
            اختر البند ثم المقاول لتظهر أسماء العمال.
          </div>
        )}

        {contractorId && !projectId && (
          <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#8A6100' }}>
            اختر المشروع أولاً لتظهر أسماء العمال.
          </div>
        )}

        {contractorId && projectId && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 16px 16px' }}>
            {shown.map((l) => (
              <button key={l.id} type="button" onClick={() => openWorker(l)}
                      style={{
                        fontSize: 13, padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
                        background: worker?.id === l.id ? MAROON : '#fff',
                        color: worker?.id === l.id ? '#fff' : '#333',
                        border: '1px solid ' + (worker?.id === l.id ? MAROON : '#ddd'),
                      }}>
                {l.full_name}
                <span style={{ fontSize: 11, opacity: .7, marginInlineStart: 6 }}>
                  {l.trade || l.labor_class || ''}
                </span>
              </button>
            ))}
            {shown.length === 0 && (
              <span style={{ fontSize: 13, color: '#888' }}>لا نتائج مطابقة</span>
            )}
          </div>
        )}
      </div>

      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {loading && <div className="empty">جارٍ التحميل…</div>}

      {worker && !loading && weekStarts.length > 0 && (
        <>
          <div className="section">
            <header>
              <h2>{worker.full_name}</h2>
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
                    <th style={{ textAlign: 'right', padding: '8px 10px', minWidth: 150 }}>الأسبوع</th>
                    {COLS.map((c) => <th key={c} style={{ padding: '8px 4px', minWidth: 68 }}>{c}</th>)}
                    <th style={{ padding: '8px 6px' }}>أيامه</th>
                    <th style={{ padding: '8px 6px' }}>الكل</th>
                  </tr>
                </thead>
                <tbody>
                  {weekStarts.map((sd, idx) => (
                    <tr key={sd}>
                      <td style={{ padding: '6px 10px' }}>
                        <div>الأسبوع {idx + 1}</div>
                        <div style={{ fontSize: 11, opacity: .65, direction: 'ltr' }}>
                          {sd} → {addDays(sd, 5)}
                        </div>
                      </td>
                      {Array.from({ length: 6 }, (_, i) => {
                        const d = addDays(sd, i);
                        const st = marks[d] || DEF;
                        return (
                          <td key={d} style={{ padding: 3, textAlign: 'center' }}>
                            <button type="button" onClick={() => cycle(d)} title={`${d} — ${STATUS[st].ar}`}
                                    style={{
                                      width: '100%', padding: '7px 0', cursor: 'pointer',
                                      border: '1px solid rgba(0,0,0,.08)', borderRadius: 5,
                                      background: STATUS[st].bg, color: STATUS[st].fg,
                                      fontSize: 14, fontWeight: 500,
                                    }}>{STATUS[st].short}</button>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 500 }}>{weekDaysCount(sd)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" onClick={() => setWeek(sd, 'full')} style={miniBtn}>حاضر</button>
                        <button type="button" onClick={() => setWeek(sd, 'absent')} style={miniBtn}>تصفير</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td style={{ padding: '9px 10px' }}>الإجمالي</td>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#777', fontSize: 12.5 }}>
                      يومية الفرد {Number(worker.daily_rate || 0).toLocaleString('en-US')}
                    </td>
                    <td style={{ textAlign: 'center' }}>{totalDays}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>
                      {totalAmount.toLocaleString('en-US')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '4px 0 30px' }}>
            <span style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 6,
              background: sync === 'error' ? '#FBECEC' : sync === 'saving' ? '#FDF3DF' : '#E8F3EA',
              color: sync === 'error' ? '#A32B24' : sync === 'saving' ? '#8A6100' : '#2E6B3A',
            }}>
              {sync === 'saving' ? 'يُحفظ…' : sync === 'error' ? 'لم يُحفظ' : 'محفوظ تلقائياً'}
            </span>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              كل ضغطة تُحفظ وحدها — لا حاجة لزر حفظ
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const miniBtn = {
  fontSize: 10.5, padding: '2px 7px', margin: '0 2px', cursor: 'pointer',
  border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#777',
};
