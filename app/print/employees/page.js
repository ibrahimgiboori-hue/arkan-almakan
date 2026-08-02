'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import Riyal from '@/components/Riyal';
import './emp-report.css';

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;
const STATUS_AR = { active:'على رأس العمل', on_leave:'في إجازة',
                    suspended:'موقوف', terminated:'منتهي' };

export default function EmployeeReport() {
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showDuties, setShowDuties] = useState(true);
  const [err, setErr] = useState('');

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

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!rows || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const list = showAll ? rows : rows.filter((r)=>r.status !== 'terminated');
  const headUrl = pub(cfg.header_image_path);
  const footUrl = pub(cfg.footer_image_path);
  const stampUrl = pub(cfg.stamp_image_path);
  const hMm = Number(cfg.header_height_mm || 40);
  const fMm = Number(cfg.footer_height_mm || 32);
  const mTop = Number(cfg.letterhead_top_mm || 46);
  const mBot = Number(cfg.letterhead_bottom_mm || 38);
  const mSide = Number(cfg.letterhead_side_mm || 20);

  const totalGross = list.reduce((t,r)=>t+Number(r.gross_salary||0), 0);

  return (
    <>
      <div className="rtoolbar no-print">
        <div className="tb-group">
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
          <label>
            <input type="checkbox" checked={showAll}
                   onChange={(e)=>setShowAll(e.target.checked)} />
            إظهار المنتهية خدمتهم
          </label>
          <label>
            <input type="checkbox" checked={showDuties}
                   onChange={(e)=>setShowDuties(e.target.checked)} />
            إظهار عمود المهام
          </label>
        </div>
        <span className="rt-note">{list.length} موظفاً · مجموع الرواتب {money(totalGross)}</span>
      </div>

      <div className="rsheet"
           style={{ paddingTop: `${Math.max(0, mTop - hMm)}mm`,
                    paddingBottom: `${Math.max(0, mBot - fMm)}mm`,
                    paddingRight: `${mSide}mm`, paddingLeft: `${mSide}mm` }}>

        {headUrl && <img className="r-head" src={headUrl} alt="" style={{height:`${hMm}mm`}} />}

        <div className="r-title">
          <h1>تقرير الموظفين</h1>
          <div className="r-sub">
            <span>{cfg.company_name_ar}</span>
            <span className="mono">{dateAr(new Date())}</span>
          </div>
          <span className="r-rule" />
        </div>

        <table className="r-table">
          <colgroup>
            <col style={{width:'11mm'}} />
            <col style={{width:'34mm'}} />
            <col style={{width:'23mm'}} />
            <col style={{width:'26mm'}} />
            <col style={{width:'19mm'}} />
            <col style={{width:'22mm'}} />
            {showDuties && <col />}
          </colgroup>
          <thead>
            <tr>
              <th>م</th>
              <th>الاسم</th>
              <th>رقم الهوية</th>
              <th>المسمى الوظيفي</th>
              <th>التعيين</th>
              <th className="num">الراتب <Riyal /></th>
              {showDuties && <th>المهام</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.id} className={r.status === 'terminated' ? 'ended' : ''}>
                <td className="ctr mono">{i + 1}</td>
                <td className="nm">
                  {r.full_name_ar}
                  <span className="sub mono">{r.employee_no}</span>
                </td>
                <td className="mono ctr">{r.id_number || '—'}</td>
                <td>{r.job_title || '—'}
                  {r.department && <span className="sub">{r.department}</span>}
                </td>
                <td className="mono ctr">
                  {dateAr(r.hire_date)}
                  {r.service_years != null && (
                    <span className="sub">{r.service_years} سنة</span>
                  )}
                </td>
                <td className="num">{money(r.gross_salary)}</td>
                {showDuties && <td className="duties">{r.duties || '—'}</td>}
              </tr>
            ))}
            <tr className="r-total">
              <td colSpan={5}>الإجمالي — {list.length} موظفاً</td>
              <td className="num">{money(totalGross)}</td>
              {showDuties && <td />}
            </tr>
          </tbody>
        </table>

        <div className="r-foot">
          <div className="r-stamp">
            {stampUrl && <img src={stampUrl} alt=""
                              style={{height:`${cfg.stamp_size_mm || 30}mm`}} />}
          </div>
          <div className="r-info">
            <div className="ri-t">{cfg.company_name_ar}</div>
            {cfg.cr_number && <div>سجل تجاري {cfg.cr_number}</div>}
            <div className="mono">{[cfg.phone_1, cfg.email].filter(Boolean).join(' · ')}</div>
          </div>
        </div>

        {footUrl && <img className="r-footimg" src={footUrl} alt="" style={{height:`${fMm}mm`}} />}
      </div>
    </>
  );
}
