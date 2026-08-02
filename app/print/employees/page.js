'use client';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import Riyal from '@/components/Riyal';
import './emp-report.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;
const MM = 3.7795275591;

export default function EmployeeReport() {
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [pages, setPages] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showDuties, setShowDuties] = useState(true);
  const [err, setErr] = useState('');
  const measure = useRef(null);

  useEffect(() => {
    (async () => {
      const [e, s] = await Promise.all([
        supabase.from('v_employee_report').select('*'),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (e.error) { setErr('تعذّر التحميل: ' + e.error.message); return; }
      setRows(e.data || []); setCfg(s.data);
    })();
  }, []);

  const list = (rows || []).filter((r) => showAll || r.status !== 'terminated');

  // ---------- تقسيم الصفحات بالقياس الفعلي ----------
  useLayoutEffect(() => {
    if (!rows || !cfg || !measure.current) return;

    const mTop = Number(cfg.letterhead_top_mm || 46);
    const mBot = Number(cfg.letterhead_bottom_mm || 38);
    const avail = (297 - mTop - mBot - 6) * MM;

    const h = {};
    measure.current.querySelectorAll('[data-m]').forEach((el) => {
      h[el.dataset.m] = el.getBoundingClientRect().height + 1;
    });

    const headH  = h['__head']  || 0;
    const thH    = h['__th']    || 0;
    const totalH = h['__total'] || 0;
    const signH  = h['__sign']  || 0;

    const out = [];
    let cur = [], used = 0, first = true;

    list.forEach((r, i) => {
      const rh = h['r' + r.id] || 0;
      const base = (first && cur.length === 0 ? headH : 0) + (cur.length === 0 ? thH : 0);
      const isLast = i === list.length - 1;
      const tail = isLast ? totalH + signH : 0;

      if (used + base + rh + tail > avail && cur.length) {
        out.push({ rows: cur, withHead: first && out.length === 0 });
        cur = []; used = thH; first = false;
      }
      if (cur.length === 0) used += (out.length === 0 ? headH : 0) + thH;
      cur.push(r);
      used += rh;
    });

    if (cur.length) out.push({ rows: cur, withHead: out.length === 0 });
    setPages(out.length ? out : [{ rows: [], withHead: true }]);
  }, [rows, cfg, showAll, showDuties]);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!rows || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const headUrl  = pub(cfg.header_image_path);
  const footUrl  = pub(cfg.footer_image_path);
  const stampUrl = pub(cfg.stamp_image_path);
  const hMm   = Number(cfg.header_height_mm || 40);
  const fMm   = Number(cfg.footer_height_mm || 32);
  const mTop  = Number(cfg.letterhead_top_mm || 46);
  const mBot  = Number(cfg.letterhead_bottom_mm || 38);
  const mSide = Number(cfg.letterhead_side_mm || 20);
  const stampMm = Number(cfg.stamp_size_mm || 30);

  const totalGross = list.reduce((t,r)=>t+Number(r.gross_salary||0), 0);
  const totalBasic = list.reduce((t,r)=>t+Number(r.basic_salary||0), 0);

  const Cols = () => (
    <colgroup>
      <col className="c-no" />
      <col className="c-name" />
      <col className="c-id" />
      <col className="c-job" />
      <col className="c-date" />
      <col className="c-pay" />
      {showDuties && <col />}
    </colgroup>
  );

  const Head = () => (
    <thead>
      <tr>
        <th>م</th>
        <th>الاسم</th>
        <th>رقم الهوية</th>
        <th>المسمى الوظيفي</th>
        <th>تاريخ التعيين</th>
        <th className="num">الراتب <Riyal /></th>
        {showDuties && <th>المهام</th>}
      </tr>
    </thead>
  );

  const Row = ({ r, n }) => (
    <tr className={r.status === 'terminated' ? 'ended' : ''}>
      <td className="ctr mono">{n}</td>
      <td className="nm">
        <span className="n1">{r.full_name_ar}</span>
        <span className="n2 mono">{r.employee_no}</span>
      </td>
      <td className="mono ctr">{r.id_number || '—'}</td>
      <td>
        <span className="n1">{r.job_title || '—'}</span>
        {r.department && <span className="n2">{r.department}</span>}
      </td>
      <td className="ctr">
        <span className="mono d1">{dateAr(r.hire_date)}</span>
        {r.service_years != null && <span className="n2">{r.service_years} سنة</span>}
      </td>
      <td className="num pay">{money(r.gross_salary)}</td>
      {showDuties && <td className="duties">{r.duties || '—'}</td>}
    </tr>
  );

  const Title = () => (
    <div className="r-title">
      <h1>تقرير الموظفين</h1>
      <div className="r-meta">
        <span>{cfg.company_name_ar}</span>
        <span className="mono">{dateAr(new Date())}</span>
      </div>
      <span className="r-rule" />
      <div className="r-stats">
        <span><b>{list.length}</b> موظفاً</span>
        <span>الأساسي <b className="mono">{money(totalBasic)}</b></span>
        <span>الإجمالي <b className="mono">{money(totalGross)}</b></span>
      </div>
    </div>
  );

  const Total = () => (
    <table className="r-table r-sum">
      <Cols />
      <tbody>
        <tr className="r-total">
          <td colSpan={5}>الإجمالي — {list.length} موظفاً</td>
          <td className="num">{money(totalGross)}</td>
          {showDuties && <td />}
        </tr>
      </tbody>
    </table>
  );

  const Sign = () => (
    <div className="r-sign">
      <div className="rs-stamp">
        {stampUrl && <img src={stampUrl} alt="" style={{height:`${stampMm}mm`}} />}
      </div>
      <div className="rs-info">
        <div className="ri-t">{cfg.company_name_ar}</div>
        {cfg.cr_number && <div>سجل تجاري {cfg.cr_number}</div>}
        {(cfg.phone_1 || cfg.email) && (
          <div className="mono">{[cfg.phone_1, cfg.email].filter(Boolean).join(' · ')}</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="rtoolbar no-print">
        <div className="tb-group">
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
          <label>
            <input type="checkbox" checked={showAll}
                   onChange={(e)=>setShowAll(e.target.checked)} />
            المنتهية خدمتهم
          </label>
          <label>
            <input type="checkbox" checked={showDuties}
                   onChange={(e)=>setShowDuties(e.target.checked)} />
            عمود المهام
          </label>
        </div>
        <span className="rt-note">
          {pages ? `${pages.length} صفحة · ` : ''}{list.length} موظفاً ·
          {' '}مجموع الرواتب {money(totalGross)}
        </span>
      </div>

      {/* القياس المخفي */}
      <div className="measure" ref={measure}
           style={{ width: `${210 - mSide*2}mm` }} aria-hidden="true">
        <div data-m="__head"><Title /></div>
        <table className="r-table"><Cols /><Head /></table>
        <div data-m="__th" style={{height:0}} />
        {list.map((r) => (
          <table className="r-table" key={r.id}>
            <Cols />
            <tbody data-m={'r' + r.id}><Row r={r} n={1} /></tbody>
          </table>
        ))}
        <div data-m="__total"><Total /></div>
        <div data-m="__sign"><Sign /></div>
      </div>

      <div className="pages">
        {(pages || []).map((pg, pi) => {
          const startIdx = (pages || []).slice(0, pi)
            .reduce((n, p) => n + p.rows.length, 0);
          const isLast = pi === pages.length - 1;
          return (
            <div className="sheet" key={pi}>
              {headUrl
                ? <img className="r-head" src={headUrl} alt="" style={{height:`${hMm}mm`}} />
                : <div className="r-head" style={{height:`${hMm}mm`}} />}

              <div className="content"
                   style={{ paddingTop: `${Math.max(0, mTop - hMm)}mm`,
                            paddingBottom: `${Math.max(0, mBot - fMm)}mm`,
                            paddingRight: `${mSide}mm`, paddingLeft: `${mSide}mm` }}>
                {pg.withHead && <Title />}

                <table className="r-table">
                  <Cols />
                  <Head />
                  <tbody>
                    {pg.rows.map((r, i) => <Row r={r} n={startIdx + i + 1} key={r.id} />)}
                  </tbody>
                </table>

                {isLast && <Total />}
                {isLast && <Sign />}
              </div>

              <div className="pagenum">صفحة {pi+1} من {pages.length}</div>

              {footUrl
                ? <img className="r-foot" src={footUrl} alt="" style={{height:`${fMm}mm`}} />
                : <div className="r-foot" style={{height:`${fMm}mm`}} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
