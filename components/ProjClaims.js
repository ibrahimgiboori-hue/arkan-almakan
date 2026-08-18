'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money, qty as fmtQty } from '@/lib/format';
import '../../[id]/print.css';

// ============================================================
//  طباعة كشف المستخلص
//  المسار : /print/claim/[id]
// ============================================================

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

export default function PrintClaim() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [rows, setRows] = useState([]);
  const [project, setProject] = useState(null);
  const [cfg, setCfg] = useState({});
  const [stamp, setStamp] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: c, error } = await supabase
          .from('progress_claims').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!c) { setErr('المستخلص غير موجود'); return; }
        setClaim(c);

        if (c.project_id) {
          const { data: p } = await supabase.from('projects')
            .select('*').eq('id', c.project_id).maybeSingle();
          setProject(p || null);
        }

        // بنود المستخلص مع أسماء البنود من المشروع
        const { data: ln } = await supabase.from('claim_lines')
          .select('*').eq('claim_id', id);
        const ids = [...new Set((ln || []).map((l) => l.project_item_id).filter(Boolean))];
        let names = {};
        if (ids.length) {
          const { data: pit } = await supabase.from('project_items')
            .select('id, description_ar, unit').in('id', ids);
          (pit || []).forEach((x) => { names[x.id] = x; });
        }
        setRows((ln || []).map((l) => ({
          ...l,
          _name: names[l.project_item_id]?.description_ar || '—',
          _unit: names[l.project_item_id]?.unit || '',
        })));

        const { data: s } = await supabase.from('brand_settings')
          .select('*').limit(1).maybeSingle();
        setCfg(s || {});
      } catch (e) {
        setErr(e.message || String(e));
      }
    })();
  }, [id]);

  if (err) return <div style={{ padding: 40, direction: 'rtl' }}>{err}</div>;
  if (!claim) return <div style={{ padding: 40, direction: 'rtl' }}>جارٍ التحميل…</div>;

  const mTop  = cfg.margin_top ?? 47;
  const mBot  = cfg.margin_bottom ?? 39;
  const mSide = cfg.margin_side ?? 19;

  const sheetStyle = {
    padding: `${mTop}mm ${mSide}mm ${mBot}mm`,
    backgroundImage: cfg.letterhead_image_path
      ? `url(${pub(cfg.letterhead_image_path)})` : 'none',
  };

  // القيم المالية — تُقرأ بمرونة حسب ما هو موجود
  const val = (...keys) => {
    for (const k of keys) if (claim[k] != null && claim[k] !== '') return Number(claim[k]);
    return null;
  };
  const gross    = val('gross_amount');
  const previous = val('prev_cumulative');
  const retention= val('retention_amount');
  const advance  = val('advance_recovery');
  const vat      = val('vat_amount');
  const net      = val('net_payable');

  const lines = [
    ['قيمة الأعمال المنجزة حتى تاريخه', gross],
    ['يُخصم: قيمة المستخلصات السابقة', previous],
    ['يُخصم: المحتجزات', retention],
    ['يُخصم: استرداد الدفعة المقدمة', advance],
    ['ضريبة القيمة المضافة', vat],
  ].filter(([, v]) => v != null && v !== 0);

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          <button className={stamp ? 'on' : ''} onClick={() => setStamp(!stamp)}>
            {stamp ? 'الختم ظاهر' : 'الختم مخفي'}
          </button>
          <span className="tb-warn">الهوامش {mTop}/{mBot}/{mSide} مم</span>
        </div>
        <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={sheetStyle}>

          <div className="ltr-meta">
            <span>{dateAr(claim.submitted_at || claim.created_at)}</span>
            <span>{claim.claim_no || 'مسودة'}</span>
          </div>

          <div className="title-block">
            <h1>مستخلص أعمال</h1>
            <span className="title-en">PROGRESS CLAIM</span>
            <span className="title-rule" />
          </div>

          <div className="cards">
            <section className="card-doc">
              <div className="card-head">بيانات المشروع</div>
              <table><tbody>
                <tr><td className="k">المشروع</td>
                    <td className="v">{project?.name_ar || '—'}</td></tr>
                <tr><td className="k">رقم المشروع</td>
                    <td className="v mono">{project?.project_no || '—'}</td></tr>
                <tr><td className="k">الجهة المالكة</td>
                    <td className="v">{project?.client_name || project?.owner_name || '—'}</td></tr>
                <tr><td className="k">الموقع</td>
                    <td className="v">{project?.location || project?.city || '—'}</td></tr>
              </tbody></table>
            </section>

            <section className="card-doc">
              <div className="card-head">بيانات المستخلص</div>
              <table><tbody>
                <tr><td className="k">رقم المستخلص</td>
                    <td className="v mono">{claim.claim_no || 'مسودة'}</td></tr>
                <tr><td className="k">الفترة</td>
                    <td className="v">
                      {claim.period_from ? `${dateAr(claim.period_from)} — ${dateAr(claim.period_to)}` : '—'}
                    </td></tr>
                <tr><td className="k">تاريخ التقديم</td>
                    <td className="v">{dateAr(claim.submitted_at) || '—'}</td></tr>
                <tr><td className="k">تسلسل المستخلص</td>
                    <td className="v mono">{claim.seq_no ?? '—'}</td></tr>
              </tbody></table>
            </section>
          </div>

          {rows.length > 0 && (
            <table className="amounts">
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>م</th>
                  <th>بيان الأعمال</th>
                  <th style={{ width: '10%' }}>الوحدة</th>
                  <th className="mono" style={{ width: '12%' }}>الكمية</th>
                  <th className="mono" style={{ width: '14%' }}>الفئة</th>
                  <th className="mono" style={{ width: '16%' }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="mono">{i + 1}</td>
                    <td>{r._name}</td>
                    <td>{r._unit || '—'}</td>
                    <td className="mono">{fmtQty(r.qty_this)}</td>
                    <td className="mono">{money(r.unit_price)}</td>
                    <td className="mono">
                      {money(Number(r.qty_this || 0) * Number(r.unit_price || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table className="amounts">
            <thead>
              <tr><th>البيان</th><th className="mono" style={{ width: '32%' }}>المبلغ</th></tr>
            </thead>
            <tbody>
              {lines.map(([label, v]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="mono">{money(v)}</td>
                </tr>
              ))}
              <tr>
                <td>صافي المستحق لهذا المستخلص</td>
                <td className="mono">{money(net)} <Riyal /></td>
              </tr>
            </tbody>
          </table>

          {net != null && (
            <div className="tafqit">
              <span className="tf-lbl">وقدره</span>
              <span className="tf-val">{tafqit(net)}</span>
              <span className="tf-num">{money(net)}</span>
            </div>
          )}

          {claim.notes && (
            <div className="declare">
              <div className="dc-head">ملاحظات</div>
              <div className="dc-body">{claim.notes}</div>
            </div>
          )}

          <table className="sigtable">
            <thead>
              <tr>
                <th>أعدّه — أركان المكان</th>
                <th>راجعه — الاستشاري</th>
                <th>اعتمده — المالك</th>
              </tr>
            </thead>
            <tbody><tr><td /><td /><td /></tr></tbody>
          </table>

          <div className="fill" />

          <div className="footer-row">
            {stamp && cfg.stamp_image_path && (
              <div className="stamp-box">
                <img src={pub(cfg.stamp_image_path)} alt="" />
              </div>
            )}
            <div className="bank">
              <div className="bank-head">شركة أركان المكان للمقاولات</div>
              <div className="bank-line">
                سجل تجاري {cfg.cr_no || '1009112888'} · رقم ضريبي {cfg.vat_no || '312577395600003'}
              </div>
              <div className="bank-line">{cfg.phone || '0596222999'} · {cfg.email || 'info@arkanalmakansa.com'}</div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
