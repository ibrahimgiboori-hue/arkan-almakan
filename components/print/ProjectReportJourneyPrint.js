'use client';

import Riyal from '@/components/Riyal';
import { money, qty as fmtQty } from '@/lib/format';

const LEGACY_OPERATIONAL_FIELDS = [
  ['execution_status','حالة التنفيذ'],
  ['delivery_status','حالة التسليم'],
  ['claim_status','حالة المستخلص'],
  ['po_status','حالة PO'],
  ['collection_status','حالة التحصيل'],
  ['next_action','الإجراء التالي'],
  ['notes','ملاحظات'],
];

const text = (value) => String(value ?? '').trim();
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const zeroLikeText = (value) => /^0+(?:[.,]0+)?$/.test(String(value ?? '').trim());

function BlankLine({ kind = 'text', wide = false }) {
  return <span className={`blank-write-line blank-${kind} ${wide ? 'wide' : ''}`.trim()} aria-hidden="true" />;
}

function BlankWritingLines({ lines = 2 }) {
  return (
    <span className="blank-writing-lines" aria-hidden="true">
      {Array.from({ length:lines }, (_, index) => <span key={index} />)}
    </span>
  );
}

function operationalLines(row) {
  if (Array.isArray(row?.operational_lines)) {
    return row.operational_lines
      .map((item, index) => ({
        id:item?.id || `line-${index}`,
        title:text(item?.title),
        text:text(item?.text),
      }))
      .filter((item) => item.title || item.text);
  }
  const migrated = LEGACY_OPERATIONAL_FIELDS
    .filter(([key]) => text(row?.[key]))
    .map(([key,title]) => ({ id:`legacy-${key}`, title, text:text(row[key]) }));
  if (migrated.length) return migrated;
  return text(row?.status)
    ? [{ id:'legacy-status', title:'الوضع التشغيلي', text:text(row.status) }]
    : [];
}

function rowHasSourceData(row) {
  const numericKeys = ['quantity','rate','work_value','paid_value','pending_value'];
  return ['item','unit','po_reference'].some((key) => text(row?.[key]))
    || numericKeys.some((key) => Number(row?.[key] || 0) !== 0)
    || operationalLines(row).length > 0;
}

function totals(rows) {
  return rows.reduce((acc,row) => {
    acc.work += Number(row?.work_value || 0);
    acc.paid += Number(row?.paid_value || 0);
    acc.pending += Number(row?.pending_value || 0);
    return acc;
  }, { work:0, paid:0, pending:0 });
}

function generatedSummary(rows) {
  const source = rows.filter(rowHasSourceData);
  if (!source.length) return '';
  const t = totals(source);
  const parts = [`يتضمن التقرير ${source.length} ${source.length === 1 ? 'بند' : 'بنود'} مسجلة.`];
  if (t.work || t.paid || t.pending) {
    parts.push(`بلغت قيمة الأعمال المسجلة ${money(t.work)} ريال، تم تحصيل ${money(t.paid)} ريال، والمتبقي أو قيد التحويل ${money(t.pending)} ريال.`);
  }
  const highlights = source
    .map((row, index) => {
      const lines = operationalLines(row).filter((item) => item.text).slice(0,2);
      if (!lines.length) return '';
      const name = text(row.item) || `البند ${index + 1}`;
      return `${name}: ${lines.map((item) => `${item.title ? `${item.title}: ` : ''}${item.text}`).join('، ')}`;
    })
    .filter(Boolean)
    .slice(0,4);
  if (highlights.length) parts.push(highlights.join('؛ ') + '.');
  return parts.join('\n');
}

function generatedConclusion(rows) {
  const source = rows.filter(rowHasSourceData);
  if (!source.length) return '';
  const t = totals(source);
  const followups = [];
  for (const row of source) {
    for (const item of operationalLines(row)) {
      if (!item.text) continue;
      if (/إجراء|متابعة|مطلوب|التالي|قادم|متبقي/i.test(item.title)) {
        followups.push(`${text(row.item) || 'البند'}: ${item.text}`);
      }
    }
  }
  const parts = [];
  if (t.pending > 0) parts.push(`يبقى وفق القيم المسجلة مبلغ ${money(t.pending)} ريال ضمن المتبقي أو قيد التحويل.`);
  if (followups.length) parts.push(`وتتركز المتابعة القادمة على ${followups.slice(0,4).join('؛ ')}.`);
  if (!parts.length) parts.push('تستمر متابعة البنود وفق الحالات والملاحظات المسجلة أعلاه حتى استكمال الأعمال والإقفال المطلوب.');
  return parts.join(' ');
}

function reportSections(payload) {
  if (Array.isArray(payload?._report_sections)) {
    return payload._report_sections
      .map((item,index) => ({ id:item?.id || `section-${index}`, title:text(item?.title), text:text(item?.text) }))
      .filter((item) => item.title || item.text);
  }
  return text(payload?.handover)
    ? [{ id:'legacy-handover', title:'تسليم مسؤولية الموقع قبل الإجازة', text:text(payload.handover) }]
    : [];
}

function MoneyValue({ value, blank }) {
  if (blank) return <BlankLine kind="money" />;
  if (!hasValue(value)) return '—';
  return <>{money(Number(value) || 0)} <Riyal /></>;
}

export default function ProjectReportJourneyPrint({
  rows = [],
  payload = {},
  blankForm = false,
  blankStatusRows = 4,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const sourceRows = safeRows.filter(rowHasSourceData);
  const t = totals(sourceRows);
  const summary = generatedSummary(safeRows);
  const conclusion = generatedConclusion(safeRows);
  const sections = reportSections(payload);

  return (
    <>
      {!blankForm && sourceRows.length > 0 && (
        <>
          <table className="amounts report-generated-totals">
            <thead><tr><th>الملخص التنفيذي والمالي</th><th className="num">القيمة <Riyal /></th></tr></thead>
            <tbody>
              <tr><td>إجمالي قيمة الأعمال</td><td className="num">{money(t.work)} <Riyal /></td></tr>
              <tr><td>تم تحصيله</td><td className="num">{money(t.paid)} <Riyal /></td></tr>
              <tr><td>المتبقي / قيد التحويل</td><td className="num">{money(t.pending)} <Riyal /></td></tr>
            </tbody>
          </table>
          {summary && (
            <div className="declare report-generated-summary">
              <div className="dc-head">ملخص التقرير</div>
              <div className="dc-body">{summary}</div>
            </div>
          )}
        </>
      )}

      {safeRows.map((row, index) => {
        const lines = operationalLines(row);
        const isEmptyPaperRow = !blankForm && !rowHasSourceData(row);
        const paperLineCount = Math.max(1, Math.min(8, Number(blankStatusRows) || 4));
        const visibleLines = (blankForm || isEmptyPaperRow)
          ? Array.from({ length:paperLineCount }, (_, lineIndex) => ({ id:`blank-${lineIndex}`, title:'', text:'', blank:true }))
          : lines;
        const hasQuantity = !blankForm && hasValue(row.quantity) && !zeroLikeText(row.quantity);
        const unit = blankForm ? null : hasQuantity && hasValue(row.unit) ? row.unit : (row.unit === 'مقطوعية' ? row.unit : '—');

        return (
          <section className="report-item-block" key={row._id || index} data-print-atomic="item">
            {index === 0 && <div className="report-items-title">تفصيل الأعمال والمستخلصات</div>}
            <div className="report-item-summary">
              <div className="report-metric report-metric-serial">
                <span className="report-metric-label">م</span>
                <strong className="report-metric-value mono">{index + 1}</strong>
              </div>
              <div className="report-metric report-metric-item">
                <span className="report-metric-label">البند</span>
                <strong className="report-metric-value">{blankForm || isEmptyPaperRow ? <BlankLine wide /> : row.item || '—'}</strong>
              </div>
              <div className="report-metric">
                <span className="report-metric-label">الكمية</span>
                <strong className="report-metric-value mono">{blankForm || isEmptyPaperRow ? <BlankLine kind="number" /> : hasQuantity ? fmtQty(row.quantity) : '—'}</strong>
              </div>
              <div className="report-metric">
                <span className="report-metric-label">الوحدة</span>
                <strong className="report-metric-value">{blankForm || isEmptyPaperRow ? <BlankLine /> : unit}</strong>
              </div>
              <div className="report-metric report-metric-money">
                <span className="report-metric-label">قيمة الأعمال</span>
                <strong className="report-metric-value"><MoneyValue value={row.work_value} blank={blankForm || isEmptyPaperRow} /></strong>
              </div>
              <div className="report-metric report-metric-money">
                <span className="report-metric-label">المحصّل</span>
                <strong className="report-metric-value"><MoneyValue value={row.paid_value} blank={blankForm || isEmptyPaperRow} /></strong>
              </div>
              <div className="report-metric report-metric-money">
                <span className="report-metric-label">المتبقي / قيد التحويل</span>
                <strong className="report-metric-value"><MoneyValue value={row.pending_value} blank={blankForm || isEmptyPaperRow} /></strong>
              </div>
              <div className="report-metric report-metric-po">
                <span className="report-metric-label">PO / المرجع</span>
                <strong className="report-metric-value mono">{blankForm || isEmptyPaperRow ? <BlankLine /> : row.po_reference || '—'}</strong>
              </div>
            </div>

            {visibleLines.length > 0 && (
              <div className="report-operational-lines">
                {visibleLines.map((item, lineIndex) => (
                  <div className="report-operational-row" key={item.id || lineIndex}>
                    <div className="report-operational-label">
                      {item.blank ? <BlankLine wide /> : item.title || '—'}
                    </div>
                    <div className="report-operational-value">
                      {item.blank ? <BlankWritingLines lines={2} /> : item.text || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {blankForm ? (
        <div className="report-free-section blank-report-free-section" data-print-atomic="section">
          <div className="report-free-section-title"><BlankLine wide /></div>
          <div className="report-free-section-body"><BlankWritingLines lines={4} /></div>
        </div>
      ) : sections.map((section) => (
        <div className="declare report-free-section" key={section.id} data-print-atomic="section">
          {section.title && <div className="dc-head">{section.title}</div>}
          {section.text && <div className="dc-body">{section.text}</div>}
        </div>
      ))}

      {!blankForm && conclusion && (
        <div className="declare report-generated-conclusion">
          <div className="dc-head">الخلاصة</div>
          <div className="dc-body">{conclusion}</div>
        </div>
      )}
    </>
  );
}
