'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';

export default function BoardReport() {
  const [rows, setRows] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [b, s] = await Promise.all([
        supabase.from('v_board_report').select('*'),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (b.error) { setErr('تعذّر التحميل: ' + b.error.message); return; }
      setRows(b.data || []); setCfg(s.data);
    })();
  }, []);

  if (err) return <div style={{padding:40}} className="msg err">{err}</div>;
  if (!rows || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const totalOwn = rows.reduce((t,r)=>t+Number(r.ownership_pct||0), 0);

  return (
    <>
      <div className="print-doc-board_report rtoolbar no-print">
        <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        <span className="rt-note">{rows.length} عضواً · مجموع الملكية {totalOwn}٪</span>
      </div>

      <ConstitutionPrintFrame documentKey="board_report" cfg={cfg} showStamp>
        <div className="board-report-flow">
          <div className="r-title" data-print-keep-with-next="true">
            <h1>مجلس الإدارة والملاك</h1>
            <div className="r-meta">
              <span>{cfg.company_name_ar}</span>
              <span className="mono">{dateAr(new Date())}</span>
            </div>
            <span className="r-rule" />
          </div>

          {rows.length > 0 ? (
            <table className="r-table" data-print-flow="repeatable-table">
              <colgroup>
                <col className="c-no" />
                <col className="c-name" />
                <col style={{width:'26mm'}} />
                <col style={{width:'28mm'}} />
                <col style={{width:'18mm'}} />
                <col style={{width:'22mm'}} />
                <col />
              </colgroup>
              <thead>
                <tr><th>م</th><th>الاسم</th><th>الصفة</th><th>المنصب</th>
                    <th className="num">الملكية</th><th>رقم الهوية</th><th>التعيين</th></tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={r.id} data-print-flow-item="row">
                    <td className="ctr mono">{i+1}</td>
                    <td className="nm">
                      <span className="n1">{r.full_name_ar}</span>
                      {r.nationality && <span className="n2">{r.nationality}</span>}
                    </td>
                    <td>{r.kind_label}</td>
                    <td>{r.board_role || '—'}</td>
                    <td className="num">{r.ownership_pct != null ? `${r.ownership_pct}%` : '—'}</td>
                    <td className="mono ctr">{r.id_number || '—'}</td>
                    <td className="ctr">
                      <span className="mono d1">{dateAr(r.appointed_at)}</span>
                      {r.years_served != null && <span className="n2">{r.years_served} سنة</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalOwn > 0 && (
                <tfoot>
                  <tr className="r-total" data-print-row-role="total" data-print-row-atomic="true">
                    <td colSpan={4}>مجموع نسب الملكية</td>
                    <td className="num">{totalOwn}%</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <div className="print-document-footer">لا توجد سجلات مجلس ضمن النطاق الحالي.</div>
          )}

          <div className="r-sign">
            <div className="rs-info">
              <div className="ri-t">{cfg.company_name_ar}</div>
              {cfg.cr_number && <div>سجل تجاري {cfg.cr_number}</div>}
            </div>
          </div>
        </div>
      </ConstitutionPrintFrame>
    </>
  );
}
