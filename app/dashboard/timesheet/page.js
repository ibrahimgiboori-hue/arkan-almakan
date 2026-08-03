'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ============================================================
//  التايم شيت — الصفحة الرئيسية
//  الأيام تُدخل، والأسابيع تُستعرض
//  المسار : /dashboard/timesheet
// ============================================================

const MAROON = '#8B3332';
const DAY_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso = (d) => d.toISOString().slice(0, 10);
const money = (n) => Number(n || 0).toLocaleString('en-US');

export default function TimesheetHome() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [days, setDays] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [tab, setTab] = useState('days');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, project_no, name_ar').order('project_no')
      .then(({ data }) => {
        setProjects(data || []);
        if ((data || []).length === 1) setProjectId(data[0].id);
      });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) { setDays([]); setWeeks([]); return; }
    setLoading(true);
    const [d, w] = await Promise.all([
      supabase.from('v_day_summary').select('*')
        .eq('project_id', projectId).order('work_date', { ascending: false }).limit(60),
      supabase.from('v_week_view').select('*')
        .eq('project_id', projectId).order('wk_start', { ascending: false }),
    ]);
    setDays(d.data || []); setWeeks(w.data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const today = iso(new Date());
  const dayHref = (dt) => `/dashboard/timesheet/day?p=${projectId}&d=${dt}`;

  return (
    <div dir="rtl">
      <div className="page-head">
        <div>
          <h1>التايم شيت</h1>
          <p>الأيام مكان الإدخال، والأسابيع مكان الاستعراض</p>
        </div>
        <Link className="btn" href="/dashboard/timesheet/day">فتح يوم</Link>
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 260 }}>
            <label>المشروع</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <Link className="btn ghost" href="/dashboard/timesheet/worker">إدخال بحسب العامل</Link>
          <Link className="btn ghost" href="/dashboard/timesheet/report">الاستعراض والطباعة</Link>
        </div>
      </div>

      {projectId && (
        <div style={{ display: 'flex', gap: 8, margin: '0 0 12px' }}>
          <button className="btn ghost" onClick={() => setTab('days')}
                  style={tabStyle(tab === 'days')}>الأيام ({days.length})</button>
          <button className="btn ghost" onClick={() => setTab('weeks')}
                  style={tabStyle(tab === 'weeks')}>الأسابيع ({weeks.length})</button>
        </div>
      )}

      {loading && <div className="empty">جارٍ التحميل…</div>}

      {projectId && !loading && tab === 'days' && (
        <div className="section" style={{ marginTop: 0 }}>
          <header>
            <h2>آخر الأيام</h2>
            <span style={{ fontSize: 12.5, color: '#777' }}>اضغط اليوم لفتحه وتعديله</span>
          </header>
          {days.length === 0 ? (
            <div className="empty">
              <h3>لا أيام مسجّلة</h3>
              <p>ابدأ بفتح يوم وتسجيل حضوره.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', padding: '8px 10px', width: 170 }}>التاريخ</th>
                  <th style={{ padding: '8px' }}>الحاضرون</th>
                  <th style={{ padding: '8px' }}>المقاولون</th>
                  <th style={{ padding: '8px' }}>الإنتاج</th>
                  <th style={{ padding: '8px' }}>قيمة العمالة</th>
                  <th style={{ padding: '8px' }}>المنصرف</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const dt = new Date(d.work_date + 'T00:00:00');
                  return (
                    <tr key={d.day_id} style={d.work_date === today ? { background: '#FBF6F5' } : undefined}>
                      <td style={{ padding: '7px 10px' }}>
                        <Link href={dayHref(d.work_date)} style={{ fontWeight: 500 }}>
                          {DAY_AR[dt.getDay()]}
                        </Link>
                        <span style={{ fontSize: 11.5, opacity: .7, marginInlineStart: 8, direction: 'ltr' }}>
                          {d.work_date}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{d.present_count}</td>
                      <td style={{ textAlign: 'center' }}>{d.contractors_count}</td>
                      <td style={{ textAlign: 'center' }}>{d.output_qty || '—'}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(d.labor_amount)}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(d.expenses_amount)}</td>
                      <td style={{ padding: '7px 10px', fontSize: 12.5, color: '#666' }}>
                        {d.notes || (d.is_holiday ? 'إجازة' : d.weather_stop ? 'توقف بسبب الجو' : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {projectId && !loading && tab === 'weeks' && (
        <div className="section" style={{ marginTop: 0 }}>
          <header>
            <h2>الأسابيع</h2>
            <span style={{ fontSize: 12.5, color: '#777' }}>
              محسوبة من الأيام — تبدأ السبت ولا تُنشأ يدوياً
            </span>
          </header>
          {weeks.length === 0 ? (
            <div className="empty"><h3>لا أسابيع بعد</h3>
              <p>ستظهر تلقائياً بمجرد تسجيل أول يوم.</p></div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>الفترة</th>
                  <th style={{ padding: '8px' }}>أيام</th>
                  <th style={{ padding: '8px' }}>الحضور</th>
                  <th style={{ padding: '8px' }}>المقاولون</th>
                  <th style={{ padding: '8px' }}>الإنتاج</th>
                  <th style={{ padding: '8px' }}>قيمة العمالة</th>
                  <th style={{ padding: '8px' }}>المنصرف</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.wk_start}>
                    <td style={{ padding: '7px 10px', direction: 'ltr', textAlign: 'right' }}>
                      {w.wk_start} → {w.wk_end}
                    </td>
                    <td style={{ textAlign: 'center' }}>{w.days_count}</td>
                    <td style={{ textAlign: 'center' }}>{w.total_attendance}</td>
                    <td style={{ textAlign: 'center' }}>{w.contractors_count}</td>
                    <td style={{ textAlign: 'center' }}>{w.output_qty || '—'}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(w.labor_amount)}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(w.expenses_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function tabStyle(on) {
  return {
    padding: '5px 16px', fontSize: 13,
    background: on ? MAROON : '#fff',
    color: on ? '#fff' : '#444',
    borderColor: on ? MAROON : '#ddd',
  };
}
