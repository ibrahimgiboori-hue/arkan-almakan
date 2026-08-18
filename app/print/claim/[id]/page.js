'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money } from '@/lib/format';
import '../../[id]/print.css';

// ============================================================
//  طلب إصدار فاتورة — يُسلَّم للمحاسب ليستخرج الفاتورة عليه
//  المسار : /print/invoice-request/[id]
// ============================================================

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

export default function InvoiceRequest() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [project, setProject] = useState(null);
  const [cfg, setCfg] = useState({});
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: claim, error } = await supabase
          .from('progress_claims').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!claim) { setErr('المستخلص غير موجود'); return; }
        setC(claim);

        if (claim.project_id) {
          const { data: p } = await supabase.from('v_project_client')
            .select('*').eq('project_id', claim.project_id).maybeSingle();
          setProject(p || null);
        }
        const { data: s } = await supabase.from('brand_settings')
          .select('*').limit(1).maybeSingle();
        setCfg(s || {});
      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, [id]);

  if (err) return <div style={{ padding: 40, direction: 'rtl' }}>{err}</div>;
  if (!c) return <div style={{ padding: 40, direction: 'rtl' }}>جارٍ التحميل…</div>;

  const mTop = cfg.margin_top ?? 47;
  const mBot = cfg.margin_bottom ?? 39;
  const mSide = cfg.margin_side ?? 19;
  const sheetStyle = {
    padding: `${mTop}mm ${mSide}mm ${mBot}mm`,
    backgroundImage: cfg.letterhead_image_path
      ? `url(${pub(cfg.letterhead_image_path)})` : 'none',
  };

  const n = (v) => (v == null ? 0 : Number(v));
  const base = n(c.gross_amount) - n(c.prev_cumulative)
             - n(c.retention_amount) - n(c.advance_recovery)
             - n(c.other_deductions);
  const vat  = n(c.vat_amount) || Math.round(base * 0.15 * 100) / 100;
  const net  = n(c.net_payable) || Math.round((base + vat) * 100) / 100;

  return (
    <>
      <div className="toolbar">
        <span className="tb-warn">يُسلَّم للمحاسب — ليس فاتورة ضريبية</span>
        <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={sheetStyle}>

          <div className="ltr-meta">
            <span>{dateAr(c.owner_approved_at || new Date().toISOString().slice(0, 10))}</span>
            <span>REQ-{c.claim_no}</span>
          </div>

          <div className="title-block">
            <h1>طلب إصدار فاتورة ضريبية</h1>
            <span className="title-en">TAX INVOICE ISSUANCE REQUEST</span>
            <span className="title-rule" />
          </div>

          <div className="cards">
            <section className="card-doc">
              <div className="card-head">بيانات العميل</div>
              <table><tbody>
                <tr><td className="k">العميل</td>
                    <td className="v">{project?.client_name || '—'}</td></tr>
                <tr><td className="k">الرقم الضريبي للعميل</td>
                    <td className="v mono">{project?.client_vat_no || '—'}</td></tr>
                <tr><td className="k">السجل التجاري</td>
                    <td className="v mono">{project?.client_cr_no || '—'}</td></tr>
                <tr><td className="k">العنوان</td>
                    <td className="v">{project?.client_address || '—'}</td></tr>
              </tbody></table>
            </section>

            <section className="card-doc">
              <div className="card-head">مرجع الطلب</div>
              <table><tbody>
                <tr><td className="k">المشروع</td>
                    <td className="v">{project?.project_name || '—'}</td></tr>
                <tr><td className="k">رقم المستخلص</td>
                    <td className="v mono">{c.claim_no}</td></tr>
                <tr><td className="k">فترة الأعمال</td>
                    <td className="v">{dateAr(c.period_from)} — {dateAr(c.period_to)}</td></tr>
                <tr><td className="k">مرجع الاعتماد</td>
                    <td className="v mono">{c.owner_ref || '—'}</td></tr>
                <tr><td className="k">تاريخ اعتماد المالك</td>
                    <td className="v">{dateAr(c.owner_approved_at) || '—'}</td></tr>
              </tbody></table>
            </section>
          </div>

          <table className="amounts">
            <thead>
              <tr><th>بيان الاحتساب</th>
                  <th className="mono" style={{ width: '32%' }}>المبلغ</th></tr>
            </thead>
            <tbody>
              <tr><td>قيمة الأعمال المنجزة تراكمياً</td>
                  <td className="mono">{money(c.gross_amount)}</td></tr>
              {n(c.prev_cumulative) > 0 && (
                <tr><td>يُخصم: المستخلصات السابقة</td>
                    <td className="mono">{money(c.prev_cumulative)}</td></tr>
              )}
              {n(c.retention_amount) > 0 && (
                <tr><td>يُخصم: المحتجزات</td>
                    <td className="mono">{money(c.retention_amount)}</td></tr>
              )}
              {n(c.advance_recovery) > 0 && (
                <tr><td>يُخصم: استرداد الدفعة المقدمة</td>
                    <td className="mono">{money(c.advance_recovery)}</td></tr>
              )}
              {n(c.other_deductions) > 0 && (
                <tr><td>يُخصم: خصومات أخرى</td>
                    <td className="mono">{money(c.other_deductions)}</td></tr>
              )}
              <tr><td>الوعاء الخاضع للضريبة</td>
                  <td className="mono">{money(base)}</td></tr>
              <tr><td>ضريبة القيمة المضافة ١٥٪</td>
                  <td className="mono">{money(vat)}</td></tr>
              <tr><td>إجمالي قيمة الفاتورة المطلوبة</td>
                  <td className="mono">{money(net)} <Riyal /></td></tr>
            </tbody>
          </table>

          <div className="tafqit">
            <span className="tf-lbl">وقدره</span>
            <span className="tf-val">{tafqit(net)}</span>
            <span className="tf-num">{money(net)}</span>
          </div>

          <div className="declare">
            <div className="dc-head">إلى الإدارة المالية</div>
            <div className="dc-body">
{`يُرجى إصدار فاتورة ضريبية بالمبلغ الموضّح أعلاه على العميل المذكور، وفق المستخلص المعتمد المشار إليه.
وبعد الإصدار يُرفع نسخة من الفاتورة في ملف المستخلص داخل النظام، ويُدوَّن رقمها وتاريخها.
هذا الطلب مستند داخلي ولا يُعد فاتورة ضريبية ولا يقوم مقامها.`}
            </div>
          </div>

          <table className="sigtable">
            <thead>
              <tr>
                <th>طلب — إدارة المشاريع</th>
                <th>اعتماد — المدير التنفيذي</th>
                <th>استلام — المحاسب</th>
              </tr>
            </thead>
            <tbody><tr><td /><td /><td /></tr></tbody>
          </table>

          <div className="fill" />

          <div className="footer-row">
            <div className="bank">
              <div className="bank-head">شركة أركان المكان للمقاولات</div>
              <div className="bank-line">
                سجل تجاري {cfg.cr_no || '1009112888'} · رقم ضريبي {cfg.vat_no || '312577395600003'}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
