'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { filterBySelection, normalizeRecordSelection } from '@/lib/record-selection';
import Riyal from '@/components/Riyal';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import { PrintMark } from '@/components/print/PrintMarks';

export default function EmployeeReport() {
  const [rows, setRows] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showDuties, setShowDuties] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedIds(normalizeRecordSelection(params.get('selected')));
    (async () => {
      const [e, s] = await Promise.all([
        supabase.from('v_employee_report').select('*'),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (e.error) { setErr('تعذّر التحميل: ' + e.error.message); return; }
      setRows(e.data || []); setCfg(s.data);
    })();
  }, []);

  const selectionMode = selectedIds.length > 0;
  const selectedRows = useMemo(()=>rows ? filterBySelection(rows,selectedIds,'id') : [],[rows,selectedIds]);
  const list = (selectionMode ? selectedRows : (rows || [])).filter((r) => selectionMode || showAll || r.status !== 'terminated');

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!rows || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;
  if (selectionMode && !list.length) return <div style={{padding:40}} className="msg err">لا توجد سجلات موظفين تطابق التحديد المطلوب.</div>;

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
    <tr className={r.status === 'terminated' ? 'ended' : ''} data-print-flow-item="row">
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

  return (
    <>
      <div className="print-doc-employee_report rtoolbar no-print">
        <div className="tb-group">
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
          {!selectionMode&&<label>
            <input type="checkbox" checked={showAll} onChange={(e)=>setShowAll(e.target.checked)} />
            المنتهية خدمتهم
          </label>}
          <label>
            <input type="checkbox" checked={showDuties} onChange={(e)=>setShowDuties(e.target.checked)} />
            عمود المهام
          </label>
        </div>
        <span className="rt-note">
          {selectionMode?'نطاق الطباعة: المحدد فقط · ':''}{list.length} موظفاً · مجموع الرواتب {money(totalGross)}
        </span>
      </div>

      <ConstitutionPrintFrame documentKey="employee_report" cfg={cfg}>
        <div className="employee-report-flow">
          <div className="r-title" data-print-keep-with-next="true">
            <h1>{selectionMode?'تقرير الموظفين — المحدد':'تقرير الموظفين'}</h1>
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

          {list.length > 0 ? (
            <table className="r-table" data-print-flow="repeatable-table">
              <Cols />
              <Head />
              <tbody>
                {list.map((r,i)=><Row r={r} n={i+1} key={r.id} />)}
              </tbody>
              <tfoot>
                <tr className="r-total" data-print-row-role="total" data-print-row-atomic="true">
                  <td colSpan={5}>الإجمالي — {list.length} موظفاً</td>
                  <td className="num">{money(totalGross)}</td>
                  {showDuties && <td />}
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="print-document-footer">لا توجد سجلات موظفين ضمن النطاق الحالي.</div>
          )}

          <div className="r-sign">
            <div className="rs-stamp">
              <PrintMark cfg={cfg} kind="stamp" sizeMm={stampMm} mode="inline" />
            </div>
            <div className="rs-info">
              <div className="ri-t">{cfg.company_name_ar}</div>
              {cfg.cr_number && <div>سجل تجاري {cfg.cr_number}</div>}
              {(cfg.phone_1 || cfg.email) && (
                <div className="mono">{[cfg.phone_1, cfg.email].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </div>
        </div>
      </ConstitutionPrintFrame>
    </>
  );
}
