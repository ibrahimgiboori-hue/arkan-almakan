'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { tafqit } from '@/lib/tafqit';
import Riyal from '@/components/Riyal';
import { dateAr, money, qty as fmtQty } from '@/lib/format';

// ============================================================
//  مطبوعات المستخلص — النبرة والتنسيق يتبعان المرحلة
//  المسار : /print/claim/[id]        ويقبل ?doc=
//    measure  محضر قياس مشترك      (مرحلة التسجيل)
//    demand   مطالبة مالية          (التقديم والاعتماد)
//    receipt  خطاب استلام دفعة      (بعد التحصيل)
//    memo     مذكرة للمحاسب بالفاتورة
// ============================================================

const pub = (p) => p ? supabase.storage.from('brand').getPublicUrl(p).data.publicUrl : null;

const DOC_BY_STAGE = {
  draft: 'measure', submitted: 'demand', owner_approved: 'demand',
  invoiced: 'demand', collected: 'receipt',
};

const TITLES = {
  measure: ['محضر قياس وحصر أعمال', 'JOINT MEASUREMENT RECORD'],
  demand:  ['مطالبة مالية', 'PAYMENT APPLICATION'],
  receipt: ['إشعار استلام دفعة', 'PAYMENT RECEIPT NOTICE'],
  memo:    ['مذكرة داخلية — طلب إصدار فاتورة', 'INTERNAL MEMO'],
};

export default function PrintClaim() {
  const { id } = useParams();
  const sp = useSearchParams();
  const [claim, setClaim] = useState(null);
  const [rows, setRows] = useState([]);
  const [pr, setPr] = useState(null);
  const [sup, setSup] = useState('');
  const [cfg, setCfg] = useState({});
  const [stamp, setStamp] = useState(true);
  const [doc, setDoc] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: c, error } = await supabase
          .from('progress_claims').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!c) { setErr('المستخلص غير موجود'); return; }
        setClaim(c);
        setDoc(sp.get('doc') || DOC_BY_STAGE[c.status] || 'demand');

        if (c.project_id) {
          const { data: p } = await supabase.from('v_project_client')
            .select('*').eq('project_id', c.project_id).maybeSingle();
          setPr(p || null);
          const { data: raw } = await supabase.from('projects')
            .select('supervisor_id').eq('id', c.project_id).maybeSingle();
          if (raw?.supervisor_id) {
            const { data: e } = await supabase.from('employees')
              .select('full_name_ar, job_title').eq('id', raw.supervisor_id).maybeSingle();
            setSup(e ? `${e.full_name_ar}${e.job_title ? ' — ' + e.job_title : ''}` : '');
          }
        }

        const { data: ln } = await supabase.from('claim_lines')
          .select('*').eq('claim_id', id);
        const ids = [...new Set((ln || []).map((l) => l.project_item_id).filter(Boolean))];
        const names = {};
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
      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, [id, sp]);

  if (err) return <div style={{ padding: 40, direction: 'rtl' }}>{err}</div>;
  if (!claim) return <div style={{ padding: 40, direction: 'rtl' }}>جارٍ التحميل…</div>;

  const mTop = cfg.margin_top ?? 47, mBot = cfg.margin_bottom ?? 39, mSide = cfg.margin_side ?? 19;
  const sheetStyle = {
    padding: `${mTop}mm ${mSide}mm ${mBot}mm`,
    backgroundImage: cfg.letterhead_image_path
      ? `url(${pub(cfg.letterhead_image_path)})` : 'none',
  };

  const n = (v) => (v == null ? 0 : Number(v));
  const gross = n(claim.gross_amount);
  const base  = n(claim.taxable_base) || (gross - n(claim.prev_cumulative));
  const vat   = n(claim.vat_amount);
  const rate  = n(claim.vat_rate) || 0.15;
  const net   = n(claim.net_payable);
  const paid  = n(claim.collected_amount);
  const diff  = paid ? Math.round((paid - net) * 100) / 100 : 0;

  const [tAr, tEn] = TITLES[doc] || TITLES.demand;
  const totalQty = rows.reduce((t, r) => t + n(r.qty_this), 0);

  const lines = [
    ['قيمة الأعمال المنجزة تراكمياً', gross],
    ['يُخصم: قيمة المستخلصات السابقة', n(claim.prev_cumulative)],
    ['قيمة أعمال هذه الفترة — الوعاء الخاضع', base],
    [`ضريبة القيمة المضافة ${(rate * 100).toFixed(0)}٪`, vat],
    ['إجمالي المستخلص شاملاً الضريبة', base + vat],
    ['يُخصم: المحتجزات', n(claim.retention_amount)],
    ['يُخصم: استرداد الدفعة المقدمة', n(claim.advance_recovery)],
    ['يُخصم: خصومات أخرى', n(claim.other_deductions)],
  ].filter(([, v]) => v);

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          {['measure', 'demand', 'receipt', 'memo'].map((k) => (
            <button key={k} className={doc === k ? 'on' : ''} onClick={() => setDoc(k)}>
              {TITLES[k][0].split(' — ')[0]}
            </button>
          ))}
        </div>
        <div className="tb-group">
          <button className={stamp ? 'on' : ''} onClick={() => setStamp(!stamp)}>
            {stamp ? 'الختم ظاهر' : 'الختم مخفي'}
          </button>
          <button className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <div className="sheet-wrap">
        <div className="sheet" style={sheetStyle}>

          <div className="ltr-meta">
            <span>{dateAr(claim.submitted_at || claim.created_at)}</span>
            <span>{claim.claim_no || 'مسودة'}</span>
          </div>

          <div className="title-block">
            <h1>{tAr}</h1>
            <span className="title-en">{tEn}</span>
            <span className="title-rule" />
          </div>

          {doc !== 'memo' && (
            <div className="ltr-to">
              <span className="to-name">السادة / {pr?.client_name || '—'}</span>
              <span className="to-title">المحترمين</span>
            </div>
          )}
          {doc === 'memo' && (
            <div className="ltr-to">
              <span className="to-name">إلى / الإدارة المالية — المحاسب</span>
              <span className="to-title">الموقّر</span>
            </div>
          )}
          <div className="ltr-salut">السلام عليكم ورحمة الله وبركاته،،</div>

          {doc === 'measure' && (
            <p className="letter-body">
{`بالإشارة إلى أعمالنا الجارية في مشروع ${pr?.project_name || ''}، نفيدكم بأنه تم بتاريخ ${dateAr(claim.period_to)} النزول الميداني إلى الموقع بواسطة ${sup || 'ممثل إدارة المشاريع لدينا'}، وبحضور ممثليكم ومشرفي الموقع من جانبكم، وجرى قياس وحصر الأعمال المنجزة عن الفترة من ${dateAr(claim.period_from)} إلى ${dateAr(claim.period_to)}.

وقد أسفر القياس المشترك عن النتائج الموضّحة في الجدول أدناه، وهي محل اتفاق الطرفين حال التوقيع على هذا المحضر.`}
            </p>
          )}

          {doc === 'demand' && (
            <p className="letter-body">
{`إلحاقاً لأعمالنا المنفَّذة في مشروع ${pr?.project_name || ''}، وبناءً على القياس المشترك للأعمال المنجزة خلال الفترة من ${dateAr(claim.period_from)} إلى ${dateAr(claim.period_to)}، نتقدّم إليكم بمطالبتنا المالية رقم ${claim.claim_no} وفق التفصيل الموضّح أدناه.

ونأمل التكرم باعتمادها وصرف مستحقاتها وفق شروط التعاقد.`}
            </p>
          )}

          {doc === 'receipt' && (
            <p className="letter-body">
{`يسرّنا إفادتكم باستلام الدفعة المالية الخاصة بالمستخلص رقم ${claim.claim_no} عن الفترة من ${dateAr(claim.period_from)} إلى ${dateAr(claim.period_to)}، وذلك بمبلغ ${money(paid || net)} ريال، بموجب التحويل المرجعي رقم ${claim.collect_ref || '—'} بتاريخ ${dateAr(claim.collected_at)}، وقد أُودع في حساب المؤسسة.

ومرفق طيّه إشعار التحويل / كشف الحساب إثباتاً لذلك.${
  diff < 0 ? `

ونود الإشارة إلى وجود فرق قدره ${money(Math.abs(diff))} ريال بين المبلغ المستحق والمبلغ المحوَّل، ونأمل موافاتنا ببيان أسباب الفرق لتسويته في المستخلص القادم.`
  : diff > 0 ? `

كما نشكر لكم الزيادة البالغة ${money(diff)} ريال، وستُعالَج محاسبياً وتُخصم من مستحقات المستخلص القادم.`
  : ''}

ونشكر لكم حسن تعاونكم وسرعة إجراءاتكم، متطلعين إلى استمرار العمل المثمر بيننا.`}
            </p>
          )}

          {doc === 'memo' && (
            <p className="letter-body">
{`نفيدكم بأن الجهة المالكة (${pr?.client_name || '—'}) قد سدّدت مبلغ ${money(paid || net)} ريال عن المستخلص رقم ${claim.claim_no} للمشروع ${pr?.project_name || ''}، بموجب التحويل المرجعي ${claim.collect_ref || '—'} بتاريخ ${dateAr(claim.collected_at)}.

يُرجى إصدار فاتورة ضريبية على العميل المذكور بقيمة أعمال قدرها ${money(base)} ريال، وضريبة قيمة مضافة ${(rate * 100).toFixed(0)}٪ قدرها ${money(vat)} ريال، بإجمالي ${money(base + vat)} ريال.

ملاحظة: الفاتورة تُصدر على قيمة الأعمال كاملة وضريبتها، أما المحتجزات واسترداد الدفعة المقدمة فتُخصم من المبلغ المحوَّل ولا تُخصم من وعاء الضريبة.

وبعد الإصدار تُرفع نسخة من الفاتورة في ملف المستخلص داخل النظام مع تدوين رقمها وتاريخها.${
  diff !== 0 ? `

تنبيه: المبلغ المسدَّد ${diff < 0 ? 'أقل' : 'أعلى'} من المستحق بمقدار ${money(Math.abs(diff))} ريال — ${diff < 0 ? 'يُعالَج الفرق كرصيد مدين على العميل' : 'تُعالَج الزيادة كرصيد دائن للعميل'} ويُراعى في المستخلص القادم.`
  : ''}

هذه المذكرة مستند داخلي ولا تُعد فاتورة ضريبية ولا تقوم مقامها.`}
            </p>
          )}

          <div className="cards">
            <section className="card-doc">
              <div className="card-head">بيانات المشروع</div>
              <table><tbody>
                <tr><td className="k">المشروع</td><td className="v">{pr?.project_name || '—'}</td></tr>
                <tr><td className="k">رقم المشروع</td><td className="v mono">{pr?.project_no || '—'}</td></tr>
                <tr><td className="k">الموقع</td><td className="v">{pr?.client_city || '—'}</td></tr>
                {doc === 'memo' && (
                  <tr><td className="k">الرقم الضريبي للعميل</td>
                      <td className="v mono">{pr?.client_vat_no || '—'}</td></tr>
                )}
              </tbody></table>
            </section>

            <section className="card-doc">
              <div className="card-head">
                {doc === 'measure' ? 'بيانات القياس' : 'بيانات المستخلص'}
              </div>
              <table><tbody>
                <tr><td className="k">رقم المستخلص</td>
                    <td className="v mono">{claim.claim_no || 'مسودة'}</td></tr>
                <tr><td className="k">الفترة</td>
                    <td className="v">{dateAr(claim.period_from)} — {dateAr(claim.period_to)}</td></tr>
                {doc === 'measure' && (
                  <tr><td className="k">ممثل أركان المكان</td>
                      <td className="v">{sup || '—'}</td></tr>
                )}
                {(doc === 'receipt' || doc === 'memo') && (
                  <>
                    <tr><td className="k">تاريخ التحصيل</td>
                        <td className="v">{dateAr(claim.collected_at) || '—'}</td></tr>
                    <tr><td className="k">المرجع البنكي</td>
                        <td className="v mono">{claim.collect_ref || '—'}</td></tr>
                  </>
                )}
                {doc === 'demand' && (
                  <tr><td className="k">تسلسل المستخلص</td>
                      <td className="v mono">{claim.seq_no ?? '—'}</td></tr>
                )}
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
                  <th className="mono" style={{ width: '13%' }}>
                    {doc === 'measure' ? 'المقيس' : 'الكمية'}
                  </th>
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
                    <td className="mono">{money(n(r.qty_this) * n(r.unit_price))}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>الإجمالي</td>
                  <td className="mono">{fmtQty(totalQty)}</td>
                  <td />
                  <td className="mono">{money(gross)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {doc !== 'measure' && (
            <table className="amounts">
              <thead>
                <tr><th>البيان</th><th className="mono" style={{ width: '32%' }}>المبلغ</th></tr>
              </thead>
              <tbody>
                {lines.map(([l, v]) => (
                  <tr key={l}><td>{l}</td><td className="mono">{money(v)}</td></tr>
                ))}
                <tr>
                  <td>{doc === 'receipt' || doc === 'memo'
                        ? 'صافي المستحق للتحويل' : 'صافي المطالبة للتحويل'}</td>
                  <td className="mono">{money(net)} <Riyal /></td>
                </tr>
                {paid > 0 && (doc === 'receipt' || doc === 'memo') && (
                  <tr><td>المبلغ المسدَّد فعلياً</td>
                      <td className="mono">{money(paid)} <Riyal /></td></tr>
                )}
                {diff !== 0 && (doc === 'receipt' || doc === 'memo') && (
                  <tr><td>{diff < 0 ? 'فرق ناقص' : 'فرق زائد'}</td>
                      <td className="mono">{money(Math.abs(diff))}</td></tr>
                )}
              </tbody>
            </table>
          )}

          <div className="tafqit">
            <span className="tf-lbl">وقدره</span>
            <span className="tf-val">{tafqit(paid && doc !== 'demand' ? paid : net)}</span>
            <span className="tf-num">{money(paid && doc !== 'demand' ? paid : net)}</span>
          </div>

          {claim.notes && (
            <div className="declare">
              <div className="dc-head">ملاحظات</div>
              <div className="dc-body">{claim.notes}</div>
            </div>
          )}

          {doc === 'measure' && (
            <table className="sigtable">
              <thead>
                <tr>
                  <th>ممثل أركان المكان</th>
                  <th>مشرف الموقع — الجهة المالكة</th>
                  <th>الاستشاري</th>
                </tr>
              </thead>
              <tbody><tr><td /><td /><td /></tr></tbody>
            </table>
          )}
          {doc === 'demand' && (
            <table className="sigtable">
              <thead>
                <tr><th>أعدّه — أركان المكان</th><th>راجعه — الاستشاري</th><th>اعتمده — المالك</th></tr>
              </thead>
              <tbody><tr><td /><td /><td /></tr></tbody>
            </table>
          )}
          {doc === 'memo' && (
            <table className="sigtable">
              <thead>
                <tr><th>إدارة المشاريع</th><th>اعتماد المدير التنفيذي</th><th>استلام المحاسب</th></tr>
              </thead>
              <tbody><tr><td /><td /><td /></tr></tbody>
            </table>
          )}

          {doc !== 'memo' && (
            <p className="letter-body" style={{ marginTop: '4mm' }}>
              وتفضلوا بقبول فائق الاحترام والتقدير.
            </p>
          )}

          <div className="fill" />

          <div className="footer-row">
            {stamp && cfg.stamp_image_path && (
              <div className="stamp-box"><img src={pub(cfg.stamp_image_path)} alt="" /></div>
            )}
            <div className="bank">
              <div className="bank-head">شركة أركان المكان للمقاولات</div>
              <div className="bank-line">
                سجل تجاري {cfg.cr_no || '1009112888'} · رقم ضريبي {cfg.vat_no || '312577395600003'}
              </div>
              <div className="bank-line">
                {cfg.phone || '0596222999'} · {cfg.email || 'info@arkanalmakansa.com'}
              </div>
            </div>
          </div>

        </div>
      </div>
      <style jsx global>{`
/* ============================================================
   نظام تصميم مطبوعات أركان المكان
   الشبكة  : مساحة المحتوى 170 مم = 12 عموداً بفاصل 3 مم
   الصف    : 6 مم وكل عنصر يأخذ مضاعفاته
   النمطان : بطاقة معلومات رمادية ناعمة | بطاقة إلزامية شفافة حادة
   ============================================================ */
:root{
  --g-gap: 3mm;
  --g-row: 6mm;

  /* بطاقة المعلومات: رمادي شفاف 90% يُظهر العلامة المائية للشعار */
  --info-bg: rgba(244,244,244,.90);
  --info-radius: 1.2mm;
  --info-pad: 2mm 2.6mm;

  /* البطاقة الإلزامية والمالية: شفافة تماماً بحد حاد */
  --strict-border: .35mm solid #8B3332;
  --strict-hair: .2mm solid #CDBABA;
  --strict-pad: 2mm 2.6mm;

  --ink-print: #2E2E30;
  --ink-soft-print: #6B6B6D;
}

/* ---------- الشبكة ---------- */
.g-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--g-gap)}
.c2{grid-column:span 2}  .c3{grid-column:span 3}
.c4{grid-column:span 4}  .c5{grid-column:span 5}
.c6{grid-column:span 6}  .c7{grid-column:span 7}
.c8{grid-column:span 8}  .c9{grid-column:span 9}
.c12{grid-column:span 12}

/* ---------- النمط الأول : بطاقة معلومات ---------- */
.info{
  background:var(--info-bg);
  border:none;
  border-radius:var(--info-radius);
  padding:var(--info-pad);
}
.info .k{display:block;font-size:7pt;color:#8B3332;letter-spacing:.01em;margin-bottom:.4mm}
.info .v{display:block;font-size:9.5pt;color:var(--ink-print);font-weight:600;line-height:1.4}
.info .s{display:block;font-size:8pt;color:var(--ink-soft-print);margin-top:.3mm}

/* ---------- النمط الثاني : بطاقة إلزامية / مالية ---------- */
.strict{
  background:transparent;
  border:var(--strict-border);
  border-radius:0;
  padding:0;
}
.strict > .head{
  border-bottom:var(--strict-border);
  padding:1.4mm 2.6mm;
  font-size:8.5pt;font-weight:700;color:#8B3332;
  background:transparent;
}
.strict > .body{padding:var(--strict-pad);font-size:9pt;line-height:1.85;color:var(--ink-print)}

/* ============================================================
   طباعة النماذج الإدارية
   ============================================================ */
.toolbar{
  position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--hair);
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:10px 18px;flex-wrap:wrap;
}
.tb-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tb-warn{font-size:12px;color:var(--warn)}
.toolbar button{border:1px solid var(--hair-strong);background:none;padding:7px 13px;
  font-size:13.5px;color:var(--ink-soft);cursor:pointer}
.toolbar button:hover{border-color:var(--maroon);color:var(--maroon)}
.toolbar button.on{background:var(--rose-wash);border-color:var(--maroon);color:var(--maroon-dark)}
.toolbar button.primary{background:var(--maroon);border-color:var(--maroon);color:#fff}
.toolbar button.primary:hover{background:var(--maroon-dark)}

.sheet-wrap{padding:26px 14px 60px;display:flex;justify-content:center;background:#EFEAEA}
.sheet{
  width:210mm;min-height:297mm;background:#fff;box-sizing:border-box;
  box-shadow:0 1px 5px rgba(0,0,0,.15);display:flex;flex-direction:column;
  background-size:210mm 297mm;background-repeat:repeat-y;background-position:top center;
}
.fill{flex:1;min-height:var(--g-row)}

.title-block{text-align:center;margin-bottom:var(--g-row)}
.title-block h1{font-size:15pt;font-weight:600;color:var(--maroon-dark);margin:0}
.title-en{font-size:7.5pt;letter-spacing:.16em;color:var(--ink-soft-print);
  margin-top:.5mm;direction:ltr}
.title-rule{display:block;width:26mm;height:.6mm;background:var(--maroon);margin:1.2mm auto 0}

/* ---------- بطاقتا المعلومات على الشبكة : 6 + 6 ---------- */
.cards{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--g-gap);
  margin-bottom:var(--g-row)}
.card-doc{grid-column:span 6;background:var(--info-bg);border:none;
  border-radius:var(--info-radius);overflow:hidden}
.card-head{background:transparent;color:#8B3332;font-size:8pt;font-weight:700;
  padding:1.2mm 2.6mm;border-bottom:.2mm solid rgba(139,51,50,.2)}
.card-doc table{width:100%;border-collapse:collapse;font-size:9pt}
.card-doc td{padding:1.1mm 2.6mm;border-bottom:.2mm solid rgba(139,51,50,.10);
  vertical-align:top}
.card-doc tr:last-child td{border-bottom:none}
.card-doc .k{color:var(--ink-soft-print);width:46%;font-size:8.5pt}
.card-doc .v{color:var(--ink-print);font-weight:600}

/* ---------- المبالغ : مالية ← حادة وشفافة ---------- */
.amounts{width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:var(--g-row);
  border:var(--strict-border);table-layout:fixed}
.amounts td{word-wrap:break-word;overflow-wrap:break-word}
.amounts th{background:var(--maroon);color:#fff;font-weight:600;font-size:9pt;
  padding:1.4mm 2.2mm;text-align:right;border:.25mm solid var(--maroon)}
.amounts td{border:.25mm solid #CDBABA;padding:1.3mm 2.2mm;background:transparent;
  color:var(--ink-print)}
.amounts .num{font-variant-numeric:tabular-nums;direction:ltr;text-align:left;width:36%}
/* ------------------------------------------------------------
   الصنف mono يضبط اتجاه الأرقام، لكنه يحمل display:inline-block
   في التنسيق العام — وهذا يُخرج خلية الجدول من بنيته فيسقط حدها.
   نعيدها خلية طبيعية هنا.
   ------------------------------------------------------------ */
td.mono, th.mono{
  display:table-cell!important;
  font-variant-numeric:tabular-nums;
  direction:ltr;
}
td.mono{unicode-bidi:isolate}

.amounts tbody tr:last-child td{border-top:var(--strict-border);font-weight:700;
  color:var(--maroon-dark)}

/* ---------- التفقيط : التزام ---------- */
.tafqit{display:flex;align-items:center;gap:2.2mm;border:var(--strict-border);
  background:transparent;padding:1.4mm 2.6mm;font-size:9pt;margin-bottom:var(--g-row)}
.tf-lbl{color:var(--ink-soft-print);font-size:8pt;white-space:nowrap}
.tf-val{flex:1;color:var(--maroon-dark);font-weight:700}
.tf-num{color:var(--ink-print);white-space:nowrap;font-variant-numeric:tabular-nums}

/* ---------- الإقرار والتعهد : أقوى التزام ---------- */
.declare{border:var(--strict-border);margin-bottom:var(--g-row);background:transparent}
.dc-head{background:transparent;color:#8B3332;font-size:8.5pt;font-weight:700;
  padding:1.4mm 2.6mm;border-bottom:var(--strict-border)}
.dc-body{padding:2mm 2.6mm;font-size:9pt;line-height:1.85;white-space:pre-wrap;
  color:var(--ink-print)}

/* ---------- التواقيع : التزام ---------- */
.sigtable{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:var(--g-row);
  border:var(--strict-border)}
.sigtable th{background:transparent;color:#8B3332;font-weight:700;
  padding:1.2mm 1.6mm;border:.25mm solid #CDBABA;text-align:center;font-size:8pt}
.sigtable td{border:.25mm solid #CDBABA;padding:2.4mm 1.6mm;text-align:center;
  color:var(--maroon-light);font-size:7.5pt;height:15mm;vertical-align:bottom;
  background:transparent}

/* ---------- الختم والحساب ---------- */
.footer-row{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--g-gap);
  align-items:stretch}
.stamp-box{grid-column:span 4;border:var(--strict-border);display:flex;
  align-items:center;justify-content:center;padding:1.4mm;min-height:30mm}
.stamp-box img{max-width:100%;max-height:100%;object-fit:contain}
.stamp-ph{font-size:7.5pt;color:var(--maroon-light);text-align:center;line-height:1.5}
.bank{grid-column:span 8;border:var(--strict-border);padding:1.4mm 2.6mm;
  text-align:right;background:transparent}
.bank-head{font-size:8.5pt;color:#8B3332;font-weight:700;margin-bottom:.6mm}
.bank-line{font-size:8pt;color:var(--ink-print);line-height:1.7}
.bank-line.iban{color:var(--maroon);direction:ltr;text-align:right;
  font-variant-numeric:tabular-nums}

@media print{
  @page{size:A4;margin:0}

  html,body{margin:0;padding:0;background:#fff}
  .toolbar{display:none}
  .sheet-wrap{padding:0;background:#fff;display:block}

  /* ------------------------------------------------------------
     الورقة : 296 مم لا 297
     السبب : تحويل المليمتر إلى بكسل يترك كسراً زائداً، فيفيض
     المحتوى بجزء من المليمتر ويولّد صفحة ثانية فارغة تحمل
     الترويسة وحدها. المليمتر الناقص يمنع ذلك ولا يُرى بالعين.
     ------------------------------------------------------------ */
  .sheet{
    width:210mm;min-height:296mm;box-shadow:none;margin:0 auto;
    break-after:avoid;page-break-after:avoid;
  }
  .sheet:last-child{page-break-after:auto}

  .card-doc,.amounts thead,.sigtable,.declare,.tafqit,.footer-row{page-break-inside:avoid}
  .amounts thead{display:table-header-group}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    box-shadow:none!important}
}


/* ============================================================
   نموذج الخطاب العام
   ============================================================ */
.letter-body{
  font-size:10.5pt;line-height:2.05;color:var(--ink-print);
  white-space:pre-wrap;margin:0 0 var(--g-row);padding:0 1mm;
  text-align:justify;
}

/* بطاقة مُقدِّم الخطاب — أسفل يسار */
.cards .card-doc.to-left{grid-column:span 6;margin-right:auto}

/* صندوق الختم — أسفل الوسط */
.stampbox-row{display:flex;justify-content:center;margin:var(--g-row) 0}
.stampbox{position:relative;width:52mm;height:38mm}
.stampbox .sb-stamp{position:absolute;left:50%;bottom:0;transform:translateX(-50%)}
.stampbox .sb-sign{position:absolute;left:50%;bottom:8mm;
  transform:translateX(-50%) rotate(-4deg);opacity:.92}

/* ------------------------------------------------------------
   أماكن الختم والتوقيع تختفي كلياً حين لا صورة فيها
   ------------------------------------------------------------ */
.stamp-box:empty,.qs-marks:empty{display:none}
.stamp-ph{display:none}
.footer-row:not(:has(.stamp-box)):not(:has(.bank)){display:none}

/* خلايا التواقيع الفارغة: مساحة توقيع بلا نص */
.sigtable td:empty{height:16mm}
.sigtable td:empty::after{content:''}


/* ============================================================
   ترويسة الخطاب الرسمي — لا جدول ولا عناوين حقول
   ============================================================ */
.ltr-meta{display:flex;justify-content:space-between;font-size:8.5pt;
  color:var(--ink-soft-print);margin-bottom:6mm;padding-bottom:1mm;
  border-bottom:.2mm solid var(--hair)}

.ltr-head{margin-bottom:7mm}
.ltr-refs{display:flex;gap:8mm;font-size:8.5pt;color:var(--ink-soft-print);
  margin-bottom:4mm}
.ltr-subject{
  font-size:13pt;font-weight:700;color:var(--maroon-dark);
  text-align:center;margin:0 0 6mm;line-height:1.6;
}
.ltr-to{
  display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;
  font-size:11pt;font-weight:600;color:var(--ink-print);line-height:1.7;
  margin-bottom:4mm;
}
.ltr-to .to-name{flex:1}
.ltr-to .to-title{white-space:nowrap;font-weight:600}
.ltr-salut{font-size:10.5pt;color:var(--ink-print);margin-bottom:4mm}


/* ============================================================
   ضغط الخطاب الطويل عند الطباعة
   الخطاب الرسمي أطول من غيره، وأول ما يفيض هو صف الختم
   والحساب فيقفز وحده إلى ورقة ثانية. هذه القواعد تكسب
   نحو 15 مم من الفراغ دون أن يتغيّر شكل الخطاب.
   ============================================================ */
@media print{
  .letter-body{line-height:1.92;margin-bottom:4mm}
  .ltr-head{margin-bottom:5mm}
  .ltr-meta{margin-bottom:4mm}
  .ltr-subject{margin-bottom:4.5mm}
  .ltr-to{margin-bottom:3mm}
  .ltr-salut{margin-bottom:3mm}

  .stampbox-row{margin:3mm 0}
  .stamp-box{min-height:26mm}
  .footer-row{margin-top:2mm}

  /* الفراغ المرن لا يدفع المحتوى إلى ورقة جديدة */
  .fill{min-height:0}

  /* الورقة لا تُقسَّم : الضغط التلقائي في الصفحة يضمن أنها واحدة */
  .sheet{overflow:hidden}
}

      `}</style>
    </>
  );
}
