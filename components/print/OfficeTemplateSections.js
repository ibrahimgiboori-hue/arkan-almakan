'use client';

import PartiesPrint from '@/components/PartiesPrint';
import {
  OFFICE_BLOCK_KIND,
  OFFICE_FIELD_GRID_COLUMNS,
  OFFICE_GRID_COLUMNS,
  officeComposition,
  resolveOfficeFieldSpan,
} from '@/lib/print-office-model';

function nonEmpty(value) {
  return value !== undefined && value !== null && value !== '';
}

function blockStyle(span) {
  return { gridColumn:`span ${span}` };
}

function UnifiedMetadataBlock({ metadata, infoBlock, payload, renderValue }) {
  const p = payload || {};
  const metadataFields = (metadata?.fields || [])
    .filter((field) => nonEmpty(field.value))
    .map((field) => ({
      key:`meta_${field.key}`,
      label:field.label,
      value:field.value,
      type:field.type || 'text',
      span:field.span || 12,
    }));

  const section = infoBlock?.section || null;
  const sectionFields = (section?.fields || [])
    .filter((field) => nonEmpty(p[field.key]))
    .map((field) => ({
      key:`section_${field.key}`,
      label:field.label,
      value:renderValue(field, p[field.key]),
      type:field.type || 'text',
      span:resolveOfficeFieldSpan(field, section),
    }));

  const fields = [...metadataFields, ...sectionFields];
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
      <div className="office-field-grid" style={{'--office-field-columns':OFFICE_FIELD_GRID_COLUMNS}}>
        {fields.map((field) => (
          <div
            className={`office-field office-field-${field.type}`}
            key={field.key}
            style={{gridColumn:`span ${field.span}`}}
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
    <div className="office-composition" data-office-model="2.0">
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
          const columns = s.columns || [];
          const spanTotal = columns.reduce((sum, column) => sum + Number(column.span || 1), 0) || 1;
          return (
            <section {...common}>
              {s.title && <h3 className="office-block-title">{s.title}</h3>}
              <table className="office-data-table amounts" data-print-editable-columns data-print-grid-name={`office-${id}`}>
                <colgroup>
                  <col style={{width:'7mm'}} />
                  {columns.map((column) => (
                    <col key={column.key} style={{width:`${(Number(column.span || 1) / spanTotal) * 92}%`}} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="serial-col">م</th>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={['money','number'].includes(column.type) ? 'num nowrap' : column.type === 'date' ? 'nowrap' : ''}
                        data-print-type={column.type || 'text'}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((row, index) => (
                    <tr key={row._id || index}>
                      <td className="mono">{index + 1}</td>
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={['money','number'].includes(column.type) ? 'num nowrap' : column.type === 'date' ? 'nowrap' : ''}
                          data-print-type={column.type || 'text'}
                        >
                          {renderValue(column, row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
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