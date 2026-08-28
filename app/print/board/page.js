'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import '../employees/emp-report.css';

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
      <div className="rtoolbar no-print">
        <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        <span className="rt-note">{rows.length} عضواً · مجموع الملكية {totalOwn}٪</span>
      </div>

      <ConstitutionPrintFrame
        documentKey="board_report"
        cfg={cfg}
        showLetterhead
        showStamp
      >
        <div className="board-report">
            <div className="r-title">
              <h1>مجلس الإدارة والملاك</h1>
              <div className="r-meta">
                <span>{cfg.company_name_ar}</span>
                <span className="mono">{dateAr(new Date())}</span>
              </div>
              <span className="r-rule" />
            </div>

            <table className="r-table">
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
                  <tr key={r.id}>
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
                {totalOwn > 0 && (
                  <tr className="r-total">
                    <td colSpan={4}>مجموع نسب الملكية</td>
                    <td className="num">{totalOwn}%</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>

            <div className="r-sign">
              <div className="rs-stamp" aria-hidden="true" />
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
