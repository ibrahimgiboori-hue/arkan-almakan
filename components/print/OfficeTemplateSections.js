'use client';

import PartiesPrint from '@/components/PartiesPrint';
import {
  OFFICE_BLOCK_KIND,
  OFFICE_COLUMN_ROLE,
  OFFICE_FIELD_GRID_COLUMNS,
  OFFICE_GRID_COLUMNS,
  officeComposition,
  resolveOfficeFieldSpan,
  resolveOfficeMetadataFieldSpan,
  resolveOfficeRowMode,
  resolveOfficeRowValue,
  resolveOfficeTableColumns,
} from '@/lib/print-office-model';

function nonEmpty(value) {
  return value !== undefined && value !== null && value !== '';
}

function blockStyle(span) {
  return { gridColumn:`span ${span}` };
}

function renderColumnValue(renderValue, column, role, value) {
  if (role === OFFICE_COLUMN_ROLE.QUANTITY) {
    return renderValue({ ...column, type:'number' }, value);
  }
  if (role === OFFICE_COLUMN_ROLE.UNIT_PRICE && column.type === 'text') {
    return renderValue({ ...column, type:'number' }, value);
  }
  return renderValue(column, value);
}

function isNumericColumn(role, type) {
  return ['money','number'].includes(type)
    || [
      OFFICE_COLUMN_ROLE.QUANTITY,
      OFFICE_COLUMN_ROLE.UNIT_PRICE,
      OFFICE_COLUMN_ROLE.AMOUNT,
      OFFICE_COLUMN_ROLE.PAID,
      OFFICE_COLUMN_ROLE.PENDING,
    ].includes(role);
}

function UnifiedMetadataBlock({ metadata, infoBlock, payload, renderValue }) {
  const p = payload || {};
  const metadataFields = (metadata?.fields || [])
    .filter((field) => nonEmpty(field.value))
    .map((field) => ({
      key:`meta_${field.key}`,
      rawKey:field.key,
      label:field.label,
      value:field.value,
      rawValue:field.value,
      type:field.type || 'text',
      span:field.span || 12,
      metadataSpan:field.metadataSpan,
    }));

  const section = infoBlock?.section || null;
  const sectionFields = (section?.fields || [])
    .filter((field) => nonEmpty(p[field.key]))
    .map((field) => ({
      key:`section_${field.key}`,
      rawKey:field.key,
      label:field.label,
      value:renderValue(field, p[field.key]),
      rawValue:p[field.key],
      type:field.type || 'text',
      span:resolveOfficeFieldSpan(field, section),
      metadataSpan:field.metadataSpan,
    }));

  const fields = [...metadataFields, ...sectionFields]
    .map((field) => ({ ...field, span:resolveOfficeMetadataFieldSpan(field) }));
  if (!fields.length) return null;

  return (
    <section
      className="office-block office-block-info office-block-metadata"
      style={blockStyle(OFFICE_GRID_COLUMNS)}
      data-office-block="info"
      data-office-block-id="unified_document_metadata"
      data-office-split="keep"
      data-office-share-row="false"
      data-office-unified-metadata="true"
    >
      <h3 className="office-block-title">{metadata?.title || section?.title || 'بيانات المستند'}</h3>
      <div className="office-field-grid office-metadata-grid" style={{'--office-field-columns':OFFICE_FIELD_GRID_COLUMNS}}>
        {fields.map((field) => (
          <div
            className={`office-field office-field-inline office-field-${field.type}`}
            key={field.key}
            style={{gridColumn:`span ${field.span}`}}
            data-office-field-layout="inline"
          >
            <span className="office-field-label">{field.label}</span>
            <strong className="office-field-value" data-print-type={field.type}>{field.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OfficeTemplateSections({
  sections,
  payload,
  rows,
  renderValue,
  parties,
  stampUrl,
  signUrl,
  stampMm = 30,
  signMm = 20,
  documentMetadata,
}) {
  const p = payload || {};
  const lineRows = Array.isArray(rows) ? rows : [];
  const blocks = officeComposition(sections);
  const metadataInfoIndex = blocks.findIndex(({ kind, section }) => (
    kind === OFFICE_BLOCK_KIND.INFO && section?.mergeWithDocumentMetadata !== false
  ));
  const metadataInfoBlock = metadataInfoIndex >= 0 ? blocks[metadataInfoIndex] : null;

  return (
    <div className="office-composition" data-office-model="2.1">
      <UnifiedMetadataBlock
        metadata={documentMetadata}
        infoBlock={metadataInfoBlock}
        payload={p}
        renderValue={renderValue}
      />

      {blocks.map(({ section:s, id, kind, span, split, canShareRow }, blockIndex) => {
        if (blockIndex === metadataInfoIndex) return null;

        const common = {
          key:id,
          className:`office-block office-block-${kind}`,
          style:blockStyle(span),
          'data-office-block':kind,
          'data-office-block-id':id,
          'data-office-split':split,
          'data-office-share-row':canShareRow ? 'true' : 'false',
        };

        if (kind === OFFICE_BLOCK_KIND.INFO || kind === OFFICE_BLOCK_KIND.SUMMARY) {
          const fields = (s.fields || []).filter((field) => nonEmpty(p[field.key]));
          if (!fields.length) return null;
          return (
            <section {...common}>
              {s.title && <h3 className="office-block-title">{s.title}</h3>}
              <div className="office-field-grid" style={{'--office-field-columns':OFFICE_FIELD_GRID_COLUMNS}}>
                {fields.map((field) => (
                  <div
                    className={`office-field office-field-${field.type || 'text'}`}
                    key={field.key}
                    style={{gridColumn:`span ${resolveOfficeFieldSpan(field, s)}`}}
                  >
                    <span className="office-field-label">{field.label}</span>
                    <strong className="office-field-value" data-print-type={field.type || 'text'}>
                      {renderValue(field, p[field.key])}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (kind === OFFICE_BLOCK_KIND.TABLE) {
          if (!lineRows.length) return null;
          const columnLayout = resolveOfficeTableColumns(s.columns || []);
          return (
            <section {...common}>
              {s.title && <h3 className="office-block-title">{s.title}</h3>}
              <table
                className="office-data-table amounts office-semantic-table"
                data-print-editable-columns
                data-print-grid-name={`office-${id}`}
                data-office-table-layout="semantic"
              >
                <colgroup>
                  <col style={{width:'4%'}} />
                  {columnLayout.map(({ column, widthPct }) => (
                    <col key={column.key} style={{width:`${widthPct}%`}} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="serial-col" data-office-column-role="index">م</th>
                    {columnLayout.map(({ column, role }) => {
                      const numeric = isNumericColumn(role, column.type);
                      return (
                        <th
                          key={column.key}
                          className={numeric ? 'num office-numeric-column' : column.type === 'date' ? 'nowrap' : ''}
                          data-print-type={column.type || 'text'}
                          data-office-column-role={role}
                        >
                          {column.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((row, index) => {
                    const rowMode = resolveOfficeRowMode(row, s);
                    return (
                      <tr key={row._id || index} data-office-row-mode={rowMode}>
                        <td className="mono serial-col" data-office-column-role="index">{index + 1}</td>
                        {columnLayout.map(({ column, role }) => {
                          const numeric = isNumericColumn(role, column.type);
                          const rawValue = resolveOfficeRowValue(row, column, rowMode);
                          return (
                            <td
                              key={column.key}
                              className={numeric ? 'num office-numeric-column' : column.type === 'date' ? 'nowrap' : ''}
                              data-print-type={column.type || 'text'}
                              data-office-column-role={role}
                            >
                              <span className="office-cell-content">
                                {renderColumnValue(renderValue, column, role, rawValue)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        }

        if (kind === OFFICE_BLOCK_KIND.PROSE) {
          if (!nonEmpty(p[s.key])) return null;
          return (
            <section {...common}>
              {s.title && <h3 className="office-block-title">{s.title}</h3>}
              <div className="office-prose print-prose">{p[s.key]}</div>
            </section>
          );
        }

        if (kind === OFFICE_BLOCK_KIND.LETTERHEAD) {
          const hasRef = p.our_ref || p.your_ref;
          return (
            <section {...common} className={`${common.className} office-letterhead`}>
              {hasRef && (
                <div className="ltr-refs">
                  {p.our_ref && <span>إشارتنا: <span className="mono">{p.our_ref}</span></span>}
                  {p.your_ref && <span>إشارتكم: <span className="mono">{p.your_ref}</span></span>}
                </div>
              )}
              {p.letter_title && <h2 className="ltr-subject">{p.letter_title}</h2>}
              {(p.addressee || p.addressee_title) && (
                <div className="ltr-to">
                  <span className="to-name">{p.addressee}</span>
                  <span className="to-title">{p.addressee_title}</span>
                </div>
              )}
              {p.salutation && <div className="ltr-salut">{p.salutation}</div>}
            </section>
          );
        }

        if (kind === OFFICE_BLOCK_KIND.PARTIES) {
          return <section {...common}><PartiesPrint parties={parties} /></section>;
        }

        if (kind === OFFICE_BLOCK_KIND.STAMP) {
          if (!stampUrl && !signUrl) return null;
          return (
            <section {...common}>
              <div className="stampbox-row">
                <div className="stampbox">
                  {signUrl && <img className="sb-sign" src={signUrl} alt="" style={{height:`${signMm}mm`}} />}
                  {stampUrl && <img className="sb-stamp" src={stampUrl} alt="" style={{height:`${stampMm}mm`}} />}
                </div>
              </div>
            </section>
          );
        }

        if (kind === OFFICE_BLOCK_KIND.SIGNATURES) {
          const roles = s.roles || [];
          if (!roles.length) return null;
          return (
            <section {...common}>
              {s.title && <h3 className="office-block-title">{s.title}</h3>}
              <table className="sigtable">
                <thead><tr>{roles.map((role) => <th key={role}>{role}</th>)}</tr></thead>
                <tbody><tr>{roles.map((role) => <td key={role} />)}</tr></tbody>
              </table>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
