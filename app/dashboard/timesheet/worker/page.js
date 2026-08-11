'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  إدخال بحسب العامل : تختار الفرد فترى كل أسابيعه دفعة واحدة
//  اليوم هو المحور — يُنشأ عند أول إدخال فيه
//  الحفظ يدوي : التغييرات تبقى في الشاشة حتى تضغط حفظ أو تغادر العامل
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
  const [sync, setSync] = useState('idle');           // idle | saving | saved | error

  const [dirty, setDirty] = useState(0);              // عدد التغييرات غير المحفوظة
  const [ask, setAsk] = useState(null);               // { label, run } — إجراء ينتظر الحفظ

  // مراجع : تتجاوز البيانات القديمة المحتجزة داخل الإغلاق أثناء الحفظ
  const marksRef  = useRef({});
  const dayIdRef  = useRef({});
  const dirtyRef  = useRef(new Set());               // التواريخ المعدَّلة ولم تُحفظ
  const savedRef  = useRef({});                      // آخر حالة محفوظة لكل تاريخ

  useEffect(() => { marksRef.current = marks; }, [marks]);

  // تحذير المتصفح عند الإغلاق وفيه تغييرات معلّقة
  useEffect(() => {
    const onLeave = (e) => {
      if (dirtyRef.current.size === 0) return;
      e.preventDefault(); e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

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
      dayIdRef.current = dmap;
      marksRef.current = m;
      savedRef.current = { ...m };
      dirtyRef.current = new Set();
      setDirty(0); setSync('idle');
      setDayIds(dmap); setMarks(m);
      setMsg(`${w.full_name} — ${starts.length} أسبوعاً منذ ${starts[0]}`);
    } catch (e) {
      setErr('تعذّر الفتح: ' + (e.message || e));
    }
    setLoading(false);
  }, [projectId, projects]);

  // ---------- أدوات الحفظ ----------
  // اليوم يُنشأ عند أول إدخال فيه فقط — عبر دالة القاعدة الآمنة
  const ensureDay = useCallback(async (pid, d) => {
    if (dayIdRef.current[d]) return dayIdRef.current[d];
    const { data, error } = await supabase.rpc('fn_get_or_create_day', {
      p_project_id: pid, p_date: d,
    });
    if (error) throw error;
    dayIdRef.current = { ...dayIdRef.current, [d]: data };
    setDayIds(dayIdRef.current);
    return data;
  }, []);

  // ربط اليوم بالبند لهذا المقاول — سطر واحد لا يتكرر
  const ensureDayItem = useCallback(async (dayId, iid, cid) => {
    if (!iid) return;
    let q = supabase.from('day_items').select('id')
      .eq('day_id', dayId).eq('project_item_id', iid);
    q = cid ? q.eq('contractor_id', cid) : q.is('contractor_id', null);
    const { data: has } = await q.maybeSingle();
    if (has) return;
    const { error } = await supabase.from('day_items').insert({
      day_id: dayId, project_item_id: iid, contractor_id: cid || null,
    });
    // تجاهل تصادم التزامن : سطر مطابق أُنشئ في اللحظة نفسها
    if (error && error.code !== '23505') throw error;
  }, []);

  // ---------- الحفظ اليدوي ----------
  // لا شيء يُكتب في القاعدة حتى تضغط حفظ أو تغادر العامل
  const saveNow = useCallback(async () => {
    const dates = Array.from(dirtyRef.current);
    if (!dates.length) return true;

    const w = worker, pid = projectId, iid = itemId, cid = contractorId;
    if (!w)  { setErr('لا يوجد عامل مفتوح'); return false; }
    if (!pid) { setErr('اختر المشروع أولاً'); setSync('error'); return false; }

    setSync('saving'); setErr('');
    const rate = Number(w.daily_rate || 0);
    try {
      for (const d of dates) {
        const dayId = await ensureDay(pid, d);
        await ensureDayItem(dayId, iid, cid);
        const st = marksRef.current[d] || DEF;
        const { error } = await supabase.from('attendance').upsert({
          day_id: dayId, laborer_id: w.id, status: st, rate_used: rate,
        }, { onConflict: 'day_id,laborer_id' });
        if (error) throw error;
        savedRef.current = { ...savedRef.current, [d]: st };
      }
      dirtyRef.current = new Set();
      setDirty(0); setSync('saved');
      setMsg(`حُفظ ${dates.length} يوماً لـ ${w.full_name}`);
      setTimeout(() => setSync((x) => (x === 'saved' ? 'idle' : x)), 2200);
      return true;
    } catch (e) {
      // التغييرات تبقى في الشاشة — لا تضيع لأن الحفظ فشل
      setErr('تعذّر الحفظ: ' + (e.message || e));
      setSync('error');
      return false;
    }
  }, [worker, projectId, itemId, contractorId, ensureDay, ensureDayItem]);

  // أي انتقال يمرّ من هنا: إن كان هناك غير محفوظ يُسأل أولاً
  const guard = useCallback((label, run) => {
    if (dirtyRef.current.size === 0) { run(); return; }
    setAsk({ label, run });
  }, []);

  async function askSaveThen() {
    const ok = await saveNow();
    if (!ok) return;                 // فشل الحفظ: نبقى مكاننا ولا نفقد شيئاً
    const run = ask?.run; setAsk(null); run?.();
  }
  function askDiscardThen() {
    marksRef.current = { ...savedRef.current };
    setMarks(marksRef.current);
    dirtyRef.current = new Set(); setDirty(0); setSync('idle');
    const run = ask?.run; setAsk(null); run?.();
  }

  // ---------- التبديل ----------
  const touch = (dates, next) => {
    const n = { ...marksRef.current };
    dates.forEach((d) => { n[d] = typeof next === 'function' ? next(d) : next; });
    marksRef.current = n;
    setMarks(n);
    dates.forEach((d) => {
      if ((savedRef.current[d] || DEF) === (n[d] || DEF)) dirtyRef.current.delete(d);
      else dirtyRef.current.add(d);
    });
    setDirty(dirtyRef.current.size);
    if (sync !== 'error') setSync('idle');
  };

  const cycle = (d) => touch([d], (x) => {
    const cur = marksRef.current[x] || DEF;
    return CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
  });

  const setWeek = (sd, st) =>
    touch(Array.from({ length: 6 }, (_, i) => addDays(sd, i)), st);

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
            <select value={projectId}
                    onChange={(e) => { const v = e.target.value;
                      guard('تغيير المشروع', () => setProjectId(v)); }}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 230 }}>
            <label>البند الجاهز للتنفيذ</label>
            <select value={itemId} disabled={!projectId}
                    onChange={(e) => { const v = e.target.value;
                      guard('تغيير البند', () => { setItemId(v); setContractorId(''); }); }}>
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
                    onChange={(e) => { const v = e.target.value;
                      guard('تغيير المقاول', () => setContractorId(v)); }}>
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
              <button key={l.id} type="button"
                      onClick={() => guard(`الانتقال إلى ${l.full_name}`, () => openWorker(l))}
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

          <div style={{ display: 'flex', gap: 10, alignItems: 'center',
                        flexWrap: 'wrap', margin: '4px 0 30px' }}>
            <button type="button" onClick={saveNow}
                    disabled={dirty === 0 || sync === 'saving'}
                    style={{
                      fontSize: 13.5, padding: '8px 22px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid ' + (dirty ? MAROON : '#ddd'),
                      background: dirty ? MAROON : '#f4f4f4',
                      color: dirty ? '#fff' : '#999',
                    }}>
              {sync === 'saving' ? 'يُحفظ…' : 'حفظ التغييرات'}
            </button>

            <span style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 6,
              background: sync === 'error' ? '#FBECEC' : dirty ? '#FDF3DF' : '#E8F3EA',
              color:      sync === 'error' ? '#A32B24' : dirty ? '#8A6100' : '#2E6B3A',
            }}>
              {sync === 'error' ? 'لم يُحفظ — التغييرات ما زالت أمامك'
                : dirty ? `${dirty} يوماً غير محفوظ`
                : 'كل شيء محفوظ'}
            </span>

            <span style={{ fontSize: 12.5, color: '#777' }}>
              سجّل حضور العامل كاملاً ثم احفظ مرة واحدة
            </span>
          </div>

          {ask && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 80,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                background: '#fff', borderRadius: 8, padding: '22px 24px',
                width: 'min(430px, 92vw)', textAlign: 'right',
                boxShadow: '0 10px 40px rgba(0,0,0,.25)',
              }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, color: MAROON }}>
                  تغييرات غير محفوظة
                </h3>
                <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.8, margin: '0 0 16px' }}>
                  لديك <b>{dirty}</b> يوماً معدَّلاً على <b>{worker?.full_name}</b> لم يُحفظ بعد.
                  قبل {ask.label}: احفظها أو تجاهلها.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={askSaveThen} disabled={sync === 'saving'}
                          style={{ fontSize: 13.5, padding: '8px 20px', borderRadius: 6,
                                   cursor: 'pointer', border: '1px solid ' + MAROON,
                                   background: MAROON, color: '#fff' }}>
                    {sync === 'saving' ? 'يُحفظ…' : 'احفظ ثم انتقل'}
                  </button>
                  <button type="button" onClick={askDiscardThen}
                          style={{ fontSize: 13.5, padding: '8px 20px', borderRadius: 6,
                                   cursor: 'pointer', border: '1px solid #ddd',
                                   background: '#fff', color: '#A32B24' }}>
                    تجاهل التغييرات
                  </button>
                  <button type="button" onClick={() => setAsk(null)}
                          style={{ fontSize: 13.5, padding: '8px 16px', borderRadius: 6,
                                   cursor: 'pointer', border: '1px solid #ddd',
                                   background: '#fff', color: '#666' }}>
                    ابقَ هنا
                  </button>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

const miniBtn = {
  fontSize: 10.5, padding: '2px 7px', margin: '0 2px', cursor: 'pointer',
  border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#777',
};
