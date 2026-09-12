'use client';

import { Fragment } from 'react';
import Riyal from '@/components/Riyal';
import { PrintMark } from '@/components/print/PrintMarks';
import { dateAr, money, qty as fmtQty } from '@/lib/format';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { isEmptyPrintValue } from '@/lib/print-empty-value.mjs';
import styles from './CleanDocumentFlow.module.css';

export const CLEAN_DOCUMENT_SCHEMA = 'clean-document-v2';
const HANDOVER_CODE = 'CAT_PROCUREMENT_ASSETS_ASSET_HANDOVER';
const PROJECT_REPORT_PROFILE = 'project_work_claims_report';
const PROJECT_GENERATED_IDS = new Set(['executive_summary','intro','handover','conclusion']);

const HANDOVER_ACKNOWLEDGEMENT = 'أقر أنا الموظف المذكور أعلاه بأنني قد استلمت المعدات والأدوات الموضحة في الجدول أعلاه بحالة جيدة وصالحة للاستخدام، وأتعهد بالمحافظة عليها واستعمالها فقط في أغراض العمل المخصصة لها، كما أتعهد بإعادتها فور طلب الشركة أو عند انتهاء عملي بالمشروع أو إنهاء الخدمة. وفي حال فقدانها أو تلفها بسبب التقصير أو سوء الاستخدام، أتحمل المسؤولية الإدارية والمالية المترتبة على ذلك، باستثناء الاستهلاك الطبيعي والمواد الاستهلاكية غير القابلة للإعادة.';

const cleanText = (value) => String(value ?? '').trim();
const hasValue = (value) => !isEmptyPrintValue(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));

function BlankValue() {
  return <span className={styles.blankValue} aria-hidden="true" />;
}

function BlankLines({ count = 3 }) {
  return (
    <span className={styles.blankLines} aria-hidden="true">
      {Array.from({ length:Math.max(1, Number(count) || 3) }, (_, index) => <span key={index} />)}
    </span>
  );
}

function formatValue(field, value, blankForm = false) {
  if (blankForm) return <BlankValue />;
  if (!hasValue(value)) return '—';
  const type = field?.type || 'text';
  if (type === 'date') return dateAr(value);
  if (type === 'money') return <>{money(Number(value) || 0)} <Riyal /></>;
  if (type === 'number') return fmtQty(value);
  if (type === 'percent') return `${fmtQty(value)}%`;
  return String(value);
}

function fieldGridSpan(field) {
  const span = Number(field?.span || 24);
  if (field?.type === 'textarea' || Number(field?.rows || 0) > 1 || span >= 32) return 12;
  if (span >= 20) return 6;
  return 4;
}

function normalizedField(field) {
  return {
    ...field,
    key:field.key || field.k,
    label:field.label || field.key || field.k || '',
  };
}

function visibleFields(fields, payload, blankForm) {
  return (fields || [])
    .map(normalizedField)
    .filter((field) => field.key && (blankForm || field.required || hasValue(payload?.[field.key])));
}

function legacyLayout(legacy) {
  if (!legacy) return [];
  const fields = (legacy.fields || []).map((field) => ({
    key:field.k,
    label:String(field.label || '').replace(/\s*\(ريال\)\s*/g,''),
    type:field.type === 'number' && /ريال/.test(field.label || '') ? 'money' : (field.type || 'text'),
    required:!!field.required,
    span:field.type === 'textarea' ? 48 : 24,
  }));
  const sections = [];
  if (fields.length) sections.push({ id:'legacy-basic', kind:'cards', title:'البيانات الأساسية', fields });
  if (legacy.text?.k) sections.push({
    id:'legacy-text', kind:'text', key:legacy.text.k,
    title:legacy.text.label || 'التفاصيل', blankLines:legacy.text.rows || 3,
  });
  if ((legacy.signatures || []).length) sections.push({
    id:'legacy-signatures', kind:'signatures', title:'الاعتمادات والتوقيعات', roles:legacy.signatures,
  });
  return sections;
}

function handoverLayout() {
  return [
    {
      id:'handover-basic', kind:'cards', title:'1. البيانات الأساسية (Basic Information)',
      fields:[
        {key:'employee_name', label:'اسم الموظف', span:24, required:true},
        {key:'employee_no', label:'الرقم الوظيفي', span:24, required:true},
        {key:'job_title', label:'المسمى الوظيفي', span:24},
        {key:'id_number', label:'الهوية / الإقامة', span:24},
        {key:'department', label:'الإدارة / القسم', span:24},
        {key:'project_name', label:'المشروع / الموقع', span:24, required:true},
        {key:'project_no', label:'رقم المشروع', span:24},
        {key:'client_name', label:'العميل / الجهة', span:24},
      ],
    },
    {
      id:'handover-items', kind:'table', title:'2. بيان العهد والأدوات المسلمة (Items List)',
      columns:[
        {key:'asset_name', label:'بيان العهدة / الوصف التفصيلي للأدوات والمعدات', span:28, required:true},
        {key:'serial_no', label:'الرقم التسلسلي (S/N)', span:14},
        {key:'quantity', label:'الكمية', span:7, type:'number'},
        {key:'asset_condition', label:'الحالة', span:10},
        {key:'notes', label:'ملاحظات', span:13},
      ],
    },
    {
      id:'handover-legal', kind:'text', title:'3. الإقرار والتعهد القانوني (Acknowledgement & Undertaking)',
      staticText:HANDOVER_ACKNOWLEDGEMENT, legal:true,
    },
    {
      id:'handover-signatures', kind:'signatures', title:'4. الاعتمادات والتوقيعات (Signatures & Approvals)',
      roles:['مستلم العهدة (الموظف)','المسلّم / المراجع','صاحب الصلاحية / الاعتماد'],
    },
  ];
}

export function resolveCleanSections({ templateCode, tpl, legacy }) {
  if (templateCode === HANDOVER_CODE) return handoverLayout();
  const sections = tpl?.layout?.sections;
  if (Array.isArray(sections) && sections.length) return sections;
  return legacyLayout(legacy);
}

function HeaderBlock({ title, titleEn, doc, blankForm }) {
  return (
    <header className={styles.headerBlock} data-print-block-key="clean-header" data-clean-document-header="true">
      <div className={styles.titleLine}>
        <h1 className={styles.titleAr}>{title}</h1>
        {titleEn && <span className={styles.titleEn}>({titleEn})</span>}
      </div>
      <div className={styles.documentMeta}>
        <div className={styles.metaPair}>
          <div className={styles.constant} data-print-role="constant-column">الرقم المرجعي</div>
          <div className={`${styles.value} ${styles.mono}`}>{blankForm ? <BlankValue /> : (doc?.doc_number || '—')}</div>
        </div>
        <div className={styles.metaPair}>
          <div className={styles.constant} data-print-role="constant-column">تاريخ المعاملة</div>
          <div className={`${styles.value} ${styles.mono}`}>{blankForm ? <BlankValue /> : dateAr(doc?.created_at)}</div>
        </div>
      </div>
    </header>
  );
}

function SectionTitle({ children }) {
  if (!children) return null;
  return <div className={styles.sectionTitle} data-print-role="title-row" data-print-header="true">{children}</div>;
}

function PinSection({ section, payload, blankForm }) {
  const fields = visibleFields(section.fields, payload, blankForm);
  if (!fields.length) return null;
  return (
    <section className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'cards'}`}>
      <SectionTitle>{section.title}</SectionTitle>
      <div className={styles.pinGrid}>
        {fields.map((field) => {
          const span = fieldGridSpan(field);
          const full = span === 12;
          const textarea = field.type === 'textarea' || Number(field.rows || 0) > 1;
          return (
            <div
              key={field.key}
              className={[styles.fieldPair, full ? styles.fieldFull : '', textarea ? styles.fieldTextarea : ''].filter(Boolean).join(' ')}
              style={{gridColumn:`span ${span}`}}
              data-clean-field={field.key}
            >
              <div className={styles.constant} data-print-role="constant-column">{field.label}</div>
              <div className={styles.value}>{formatValue(field, payload?.[field.key], blankForm)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TotalsSection({ section, payload, blankForm }) {
  const fields = visibleFields(section.fields, payload, blankForm);
  if (!fields.length) return null;
  return (
    <section className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'totals'}`}>
      <SectionTitle>{section.title || 'الحساب'}</SectionTitle>
      <div className={styles.totalsGrid}>
        {fields.map((field) => (
          <div key={field.key} className={`${styles.totalPair} ${field.emphasis ? styles.totalEmphasis : ''}`}>
            <div className={styles.constant} data-print-role="constant-column">{field.label}</div>
            <div className={`${styles.value} ${styles.moneyCell}`}>{formatValue(field, payload?.[field.key], blankForm)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CleanTable({ section, rows, blankForm }) {
  const columns = (section.columns || []).map(normalizedField);
  if (!columns.length || !rows?.length) return null;
  const spanTotal = columns.reduce((sum, column) => sum + Number(column.span || 1), 0) || 1;
  return (
    <Fragment>
      {section.title && (
        <div className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'table'}:title`} data-print-keep-with-next="true">
          <SectionTitle>{section.title}</SectionTitle>
        </div>
      )}
      <div className={styles.tableWrap} data-print-block-key={`clean:${section.id || 'table'}`}>
        <table className={styles.table} data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
          <colgroup>
            <col style={{width:'7mm'}} />
            {columns.map((column) => <col key={column.key} style={{width:`${(Number(column.span || 1) / spanTotal) * 92}%`}} />)}
          </colgroup>
          <thead>
            <tr data-print-role="title-row">
              <th className={styles.serial}>م</th>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row?._id || `${section.id || 'row'}-${index}`}>
                <td className={`${styles.serial} ${styles.mono}`}>{index + 1}</td>
                {columns.map((column) => {
                  const className = column.type === 'money' ? styles.moneyCell : ['number','percent'].includes(column.type) ? styles.numberCell : '';
                  return <td key={column.key} className={className}>{formatValue(column, row?.[column.key], blankForm || row?._blank)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Fragment>
  );
}

function TextSection({ section, payload, blankForm }) {
  const raw = section.staticText ?? payload?.[section.key];
  if (!blankForm && !hasValue(raw)) return null;
  return (
    <section className={`${styles.textBlock} ${section.legal ? styles.legalText : ''}`} data-print-block-key={`clean:${section.id || 'text'}`}>
      <SectionTitle>{section.title}</SectionTitle>
      <div className={styles.textBody}>
        {blankForm && !section.staticText ? <BlankLines count={section.blankLines || section.rows || 3} /> : raw}
      </div>
    </section>
  );
}

function SignaturesSection({ section }) {
  const roles = (section.roles || []).filter(Boolean);
  if (!roles.length) return null;
  const count = Math.min(Math.max(roles.length, 1), 4);
  return (
    <section className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'signatures'}`} data-print-atomic="signatures">
      <SectionTitle>{section.title || 'الاعتمادات والتوقيعات'}</SectionTitle>
      <div className={styles.signatureGrid} style={{'--signature-count':count}}>
        {roles.map((role) => (
          <div className={styles.signatureCard} key={role}>
            <div className={styles.signatureRole}>{role}</div>
            <div className={styles.signatureLine}><span>الاسم:</span><span className={styles.signatureWrite} /></div>
            <div className={styles.signatureLine}><span>التاريخ:</span><span className={styles.signatureWrite} /></div>
            <div className={styles.signatureLine}><span>التوقيع:</span><span className={styles.signatureWrite} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PartyCard({ card, blankForm }) {
  const rows = (card?.rows || []).filter((row) => blankForm ? cleanText(row?.k) : cleanText(row?.k) || cleanText(row?.v));
  if (!rows.length && !cleanText(card?.heading)) return null;
  return (
    <div className={styles.partyCard}>
      {card?.heading && <div className={styles.partyHeading} data-print-role="title-row">{card.heading}</div>}
      {rows.map((row, index) => (
        <div className={styles.partyRow} key={`${row?.k || 'row'}-${index}`}>
          <div data-print-role="constant-column">{row?.k}</div>
          <div>{blankForm ? <BlankValue /> : (row?.v || '—')}</div>
        </div>
      ))}
    </div>
  );
}

function PartiesSection({ section, payload, blankForm }) {
  const parties = payload?.parties;
  const cards = parties?.cards || [];
  if (!cards.length) return null;
  return (
    <section className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'parties'}`}>
      <SectionTitle>{section.title || 'الأطراف'}</SectionTitle>
      <div className={styles.partiesGrid}>
        {cards.map((card, index) => <PartyCard key={index} card={card} blankForm={blankForm} />)}
      </div>
      {parties?.middle_text && <div className={styles.textBody}>{blankForm ? <BlankLines count={2} /> : parties.middle_text}</div>}
    </section>
  );
}

function LetterHeadSection({ tpl, payload, blankForm }) {
  const fillFields = visibleFields(tpl?.layout?.fill_fields || [], payload, blankForm);
  const title = blankForm ? (tpl?.name_ar || 'خطاب') : (payload?.letter_title || tpl?.name_ar || 'خطاب');
  const addressee = payload?.addressee;
  const addresseeTitle = payload?.addressee_title;
  const salutation = payload?.salutation;
  const refs = [payload?.our_ref && `إشارتنا: ${payload.our_ref}`, payload?.your_ref && `إشارتكم: ${payload.your_ref}`].filter(Boolean).join(' · ');
  const extra = fillFields.filter((field) => !['letter_title','addressee','addressee_title','salutation','our_ref','your_ref'].includes(field.key));
  return (
    <section className={styles.letterHeadBlock} data-print-block-key="clean:letterhead">
      <div className={styles.letterAddress}>
        <div>
          <div className={styles.letterAddressee}>{blankForm ? <BlankValue /> : (addressee || '')}</div>
          {addresseeTitle && <div>{addresseeTitle}</div>}
          {salutation && <div>{salutation}</div>}
        </div>
        {refs && <div className={styles.mono}>{refs}</div>}
      </div>
      <div className={styles.letterSubject}>{title}</div>
      {extra.length > 0 && (
        <div className={styles.pinGrid}>
          {extra.map((field) => (
            <div key={field.key} className={styles.fieldPair} style={{gridColumn:`span ${fieldGridSpan(field)}`}}>
              <div className={styles.constant} data-print-role="constant-column">{field.label}</div>
              <div className={styles.value}>{formatValue(field, payload?.[field.key], blankForm)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StampSection({ cfg, stamp, blankForm, section }) {
  if (blankForm) return null;
  return (
    <section className={styles.sectionBlock} data-print-block-key={`clean:${section.id || 'stamp'}`} style={{display:'flex',justifyContent:'center',gap:'5mm',alignItems:'center'}}>
      <PrintMark cfg={cfg} kind="signature" mode="inline" />
      <PrintMark cfg={cfg} kind="stamp" show={stamp} mode="inline" />
    </section>
  );
}

function projectOperationalLines(row) {
  if (Array.isArray(row?.operational_lines)) {
    return row.operational_lines
      .map((item, index) => ({id:item?.id || `line-${index}`, title:cleanText(item?.title), text:cleanText(item?.text)}))
      .filter((item) => item.title || item.text);
  }
  const legacyFields = [
    ['execution_status','حالة التنفيذ'], ['delivery_status','حالة التسليم'], ['claim_status','حالة المستخلص'],
    ['po_status','حالة PO'], ['collection_status','حالة التحصيل'], ['next_action','الإجراء التالي'], ['notes','ملاحظات'],
  ];
  const lines = legacyFields.filter(([key]) => cleanText(row?.[key])).map(([key,title]) => ({id:key,title,text:cleanText(row[key])}));
  if (lines.length) return lines;
  return cleanText(row?.status) ? [{id:'status',title:'الوضع التشغيلي',text:cleanText(row.status)}] : [];
}

function projectRowHasData(row) {
  return ['item','unit','po_reference'].some((key) => cleanText(row?.[key]))
    || ['quantity','rate','work_value','paid_value','pending_value'].some((key) => Number(row?.[key] || 0) !== 0)
    || projectOperationalLines(row).length > 0;
}

function projectTotals(rows) {
  return (rows || []).filter(projectRowHasData).reduce((acc,row) => {
    acc.work += Number(row?.work_value || 0);
    acc.paid += Number(row?.paid_value || 0);
    acc.pending += Number(row?.pending_value || 0);
    return acc;
  }, {work:0,paid:0,pending:0});
}

function ProjectReportFlow({ rows, payload, blankForm, blankStatusRows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totals = projectTotals(safeRows);
  const blocks = [];
  if (!blankForm && safeRows.some(projectRowHasData)) {
    blocks.push(
      <section className={styles.sectionBlock} key="project-totals" data-print-block-key="clean:project-summary">
        <SectionTitle>الملخص التنفيذي والمالي</SectionTitle>
        <div className={styles.totalsGrid}>
          {[
            ['إجمالي قيمة الأعمال', totals.work], ['تم تحصيله', totals.paid], ['المتبقي / قيد التحويل', totals.pending],
          ].map(([label,value]) => (
            <div className={styles.totalPair} key={label}>
              <div className={styles.constant} data-print-role="constant-column">{label}</div>
              <div className={`${styles.value} ${styles.moneyCell}`}>{money(value)} <Riyal /></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  safeRows.forEach((row,index) => {
    const realLines = projectOperationalLines(row);
    const lineCount = clamp(blankStatusRows || 4, 1, 8);
    const lines = blankForm || !projectRowHasData(row)
      ? Array.from({length:lineCount}, (_,i) => ({id:`blank-${i}`,title:'',text:'',blank:true}))
      : realLines;
    blocks.push(
      <section className={styles.projectItem} key={row?._id || `project-row-${index}`} data-print-block-key={`clean:project-item:${index}`} data-print-atomic="item">
        {index === 0 && <SectionTitle>تفصيل الأعمال والمستخلصات</SectionTitle>}
        <div className={styles.projectItemGrid}>
          {[
            ['م',index + 1,'serial'], ['البند',row?.item,'text'], ['الكمية',row?.quantity,'number'], ['الوحدة',row?.unit,'text'],
            ['قيمة الأعمال',row?.work_value,'money'], ['المحصّل',row?.paid_value,'money'], ['المتبقي / قيد التحويل',row?.pending_value,'money'], ['PO / المرجع',row?.po_reference,'text'],
          ].map(([label,value,type],metricIndex) => (
            <div className={styles.projectMetric} key={`${label}-${metricIndex}`}>
              <div className={styles.projectMetricLabel} data-print-role="constant-column">{label}</div>
              <div className={styles.projectMetricValue}>{blankForm || !projectRowHasData(row) ? <BlankValue /> : formatValue({type}, value, false)}</div>
            </div>
          ))}
        </div>
        {lines.map((line,lineIndex) => (
          <div className={styles.operationalRow} key={line.id || lineIndex}>
            <div data-print-role="constant-column">{line.blank ? <BlankValue /> : (line.title || 'ملاحظة')}</div>
            <div>{line.blank ? <BlankLines count={1} /> : (line.text || '—')}</div>
          </div>
        ))}
      </section>
    );
  });

  const reportSections = Array.isArray(payload?._report_sections) ? payload._report_sections : [];
  reportSections.forEach((section,index) => {
    if (!section?.title && !section?.text) return;
    blocks.push(<TextSection key={`report-free-${index}`} section={{id:`report-free-${index}`,title:section.title,staticText:section.text}} payload={payload} blankForm={false} />);
  });
  return blocks;
}

function FooterInfo({ cfg, bank, stamp, blankForm, hasStampSection }) {
  if (blankForm) return null;
  const companyLines = [];
  if (cfg?.cr_number) companyLines.push(`سجل تجاري ${cfg.cr_number}`);
  if (cfg?.vat_number) companyLines.push(`رقم ضريبي ${cfg.vat_number}`);
  const contact = [cfg?.phone_1, cfg?.email].filter(Boolean).join(' · ');
  const showBank = bank && (cfg?.bank_name_full || cfg?.bank_account_no || cfg?.bank_iban);
  const hasAnything = showBank || companyLines.length || contact || (stamp && !hasStampSection);
  if (!hasAnything) return null;
  return (
    <footer className={styles.footerInfo} data-print-block-key="clean:footer">
      <div className={styles.bankBlock}>
        {showBank ? (
          <>
            <div className={styles.bankTitle}>تفاصيل الحساب البنكي</div>
            {cfg.bank_name_full && <div>{cfg.bank_name_full}</div>}
            {cfg.bank_account_no && <div>رقم الحساب: <span className={styles.mono}>{cfg.bank_account_no}</span></div>}
            {cfg.bank_iban && <div className={styles.mono}>IBAN: {cfg.bank_iban}</div>}
          </>
        ) : (
          <>
            {companyLines.length > 0 && <div>{companyLines.join(' · ')}</div>}
            {contact && <div>{contact}</div>}
          </>
        )}
      </div>
      {stamp && !hasStampSection && <PrintMark cfg={cfg} kind="stamp" mode="inline" />}
    </footer>
  );
}

export function buildCleanDocumentBlocks({
  doc,
  tpl,
  legacy,
  title,
  titleEn,
  payload,
  rows,
  blankForm,
  blankStatusRows = 4,
  cfg,
  stamp = true,
  bank = false,
}) {
  const sections = resolveCleanSections({ templateCode:doc?.template_code, tpl, legacy });
  const profile = tpl?.layout?.profile;
  const hasLetterHead = sections.some((section) => section.kind === 'letterhead');
  const hasStampSection = sections.some((section) => section.kind === 'stampbox');
  const blocks = [];

  if (!hasLetterHead) {
    blocks.push(<HeaderBlock key="clean-header" title={title} titleEn={titleEn} doc={doc} blankForm={blankForm} />);
  }

  if (tpl?.intro_text) {
    blocks.push(<TextSection key="clean-intro" section={{id:'template-intro',title:'',staticText:tpl.intro_text}} payload={payload} blankForm={false} />);
  }

  let projectFlowInserted = false;
  sections.forEach((section,index) => {
    if (!section) return;
    if (profile === PROJECT_REPORT_PROFILE && PROJECT_GENERATED_IDS.has(section.id)) return;

    if (section.kind === 'letterhead') {
      blocks.push(<LetterHeadSection key={section.id || `letterhead-${index}`} tpl={tpl} payload={payload} blankForm={blankForm} />);
      return;
    }
    if (section.kind === 'cards') {
      blocks.push(<PinSection key={section.id || `cards-${index}`} section={section} payload={payload} blankForm={blankForm} />);
      return;
    }
    if (section.kind === 'totals') {
      blocks.push(<TotalsSection key={section.id || `totals-${index}`} section={section} payload={payload} blankForm={blankForm} />);
      return;
    }
    if (section.kind === 'table') {
      if (profile === PROJECT_REPORT_PROFILE && section.id === 'work_lines') {
        if (!projectFlowInserted) {
          blocks.push(...ProjectReportFlow({rows,payload,blankForm,blankStatusRows}));
          projectFlowInserted = true;
        }
      } else {
        blocks.push(<CleanTable key={section.id || `table-${index}`} section={section} rows={rows} blankForm={blankForm} />);
      }
      return;
    }
    if (section.kind === 'text') {
      blocks.push(<TextSection key={section.id || `text-${index}`} section={section} payload={payload} blankForm={blankForm} />);
      return;
    }
    if (section.kind === 'signatures') {
      blocks.push(<SignaturesSection key={section.id || `signatures-${index}`} section={section} />);
      return;
    }
    if (section.kind === 'parties') {
      blocks.push(<PartiesSection key={section.id || `parties-${index}`} section={section} payload={payload} blankForm={blankForm} />);
      return;
    }
    if (section.kind === 'stampbox') {
      blocks.push(<StampSection key={section.id || `stamp-${index}`} cfg={cfg} stamp={stamp} blankForm={blankForm} section={section} />);
    }
  });

  blocks.push(<FooterInfo key="clean-footer" cfg={cfg} bank={bank} stamp={stamp} blankForm={blankForm} hasStampSection={hasStampSection} />);

  return (
    <div
      className={styles.document}
      data-clean-document={CLEAN_DOCUMENT_SCHEMA}
      data-clean-template-code={doc?.template_code || ''}
      data-print-semantic-scope="true"
    >
      {blocks.filter(Boolean)}
    </div>
  );
}

export function CleanPrintToolbar({
  stamp,
  setStamp,
  bank,
  setBank,
  blankForm,
  setBlankForm,
  hasRepeatableSection,
  blankRows,
  setBlankRows,
  isProjectReport,
  blankStatusRows,
  setBlankStatusRows,
}) {
  return (
    <div className={`${styles.toolbar} no-print`}>
      <div className={styles.toolbarGroup}>
        <button data-active={stamp && !blankForm} onClick={() => setStamp(!stamp)} disabled={blankForm}>
          {blankForm ? 'الختم لا يظهر في النموذج الفارغ' : stamp ? 'الختم ظاهر' : 'الختم مخفي'}
        </button>
        <button data-active={bank} onClick={() => setBank(!bank)}>{bank ? 'الحساب البنكي ظاهر' : 'الحساب البنكي مخفي'}</button>
        <button data-active={blankForm} onClick={() => setBlankForm((value) => !value)}>{blankForm ? 'العودة للمستند المعبأ' : 'طباعة نموذج فارغ'}</button>
        {blankForm && hasRepeatableSection && (
          <label className={styles.rowControl}>
            <span>عدد البنود</span>
            <input type="number" min="1" max="20" value={blankRows} onChange={(event) => setBlankRows(clamp(event.target.value,1,20))} />
          </label>
        )}
        {blankForm && isProjectReport && (
          <label className={styles.rowControl}>
            <span>أسطر المتابعة لكل بند</span>
            <input type="number" min="1" max="8" value={blankStatusRows} onChange={(event) => setBlankStatusRows(clamp(event.target.value,1,8))} />
          </label>
        )}
      </div>
      <div className={styles.toolbarGroup}>
        <span className={styles.toolbarNotice}>محرك النماذج الجديد — تصميم نظيف مضغوط، والقبطان وحده يدير هندسة الصفحة</span>
        <button data-primary="true" onClick={() => window.print()}>{blankForm ? 'طباعة النموذج الفارغ' : 'طباعة أو حفظ PDF'}</button>
      </div>
    </div>
  );
}
