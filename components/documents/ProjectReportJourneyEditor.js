'use client';

import { uid } from '@/lib/form-engine';

const ENTRY_FIELDS = [
  { key:'item', label:'البند', type:'text' },
  { key:'quantity', label:'الكمية', type:'number' },
  { key:'unit', label:'الوحدة', type:'text' },
  { key:'rate', label:'سعر الوحدة', type:'money' },
  { key:'work_value', label:'قيمة الأعمال', type:'money' },
  { key:'paid_value', label:'المحصّل', type:'money' },
  { key:'pending_value', label:'المتبقي / قيد التحويل', type:'money' },
  { key:'po_reference', label:'PO / المرجع', type:'text' },
];

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

function line(id, title = '', value = '') {
  return { id:id || uid(), title, text:value };
}

function rowLines(row) {
  if (Array.isArray(row?.operational_lines)) {
    return row.operational_lines.map((item) => line(item?.id, item?.title || '', item?.text || ''));
  }
  const migrated = LEGACY_OPERATIONAL_FIELDS
    .filter(([key]) => text(row?.[key]))
    .map(([key,title]) => line(`legacy-${key}`, title, row[key]));
  if (migrated.length) return migrated;
  return text(row?.status) ? [line('legacy-status', 'الوضع التشغيلي', row.status)] : [];
}

function normalizeSections(value, legacyHandover) {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      id:item?.id || uid(),
      title:item?.title || '',
      text:item?.text || '',
    }));
  }
  return text(legacyHandover)
    ? [{ id:'legacy-handover', title:'تسليم مسؤولية الموقع قبل الإجازة', text:legacyHandover }]
    : [];
}

export default function ProjectReportJourneyEditor({
  rows,
  setRows,
  reportSections,
  legacyHandover,
  onReportSectionsChange,
  disabled = false,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const sections = normalizeSections(reportSections, legacyHandover);

  const updateRow = (rowId, patch) => {
    setRows(safeRows.map((row) => row._id === rowId ? { ...row, ...patch } : row));
  };

  const updateEntry = (rowId, field, raw) => {
    const value = ['money','number'].includes(field.type) ? Number(raw || 0) : raw;
    updateRow(rowId, { [field.key]:value });
  };

  const persistLines = (rowId, nextLines) => updateRow(rowId, { operational_lines:nextLines });

  const addOperationalLine = (row) => {
    persistLines(row._id, [...rowLines(row), line(uid())]);
  };

  const updateOperationalLine = (row, lineId, key, value) => {
    persistLines(row._id, rowLines(row).map((item) => item.id === lineId ? { ...item, [key]:value } : item));
  };

  const deleteOperationalLine = (row, lineId) => {
    persistLines(row._id, rowLines(row).filter((item) => item.id !== lineId));
  };

  const moveOperationalLine = (row, lineId, delta) => {
    const lines = rowLines(row);
    const index = lines.findIndex((item) => item.id === lineId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    persistLines(row._id, next);
  };

  const addRow = () => setRows([...safeRows, { _id:uid(), operational_lines:[] }]);
  const deleteRow = (rowId) => setRows(safeRows.filter((row) => row._id !== rowId));

  const saveSections = (next) => onReportSectionsChange(next);
  const addSection = () => saveSections([...sections, { id:uid(), title:'', text:'' }]);
  const updateSection = (sectionId, key, value) => {
    saveSections(sections.map((item) => item.id === sectionId ? { ...item, [key]:value } : item));
  };
  const deleteSection = (sectionId) => saveSections(sections.filter((item) => item.id !== sectionId));
  const moveSection = (sectionId, delta) => {
    const index = sections.findIndex((item) => item.id === sectionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    saveSections(next);
  };

  return (
    <div style={{padding:18,display:'grid',gap:14}}>
      {!disabled && (
        <div>
          <button type="button" className="btn ghost" onClick={addRow}>إضافة بند</button>
        </div>
      )}

      {safeRows.map((row, index) => {
        const lines = rowLines(row);
        return (
          <div key={row._id} style={{border:'1px solid var(--hair)',borderRadius:8,overflow:'hidden',background:'#fff'}}>
            <div style={{padding:'9px 12px',background:'var(--paper-soft)',display:'flex',alignItems:'center',gap:10}}>
              <strong style={{color:'var(--maroon)'}}>البند {index + 1}</strong>
              <span style={{fontWeight:700}}>{text(row.item) || 'بند جديد'}</span>
              <span className="spacer" />
              {!disabled && (
                <button type="button" className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>deleteRow(row._id)}>
                  حذف البند
                </button>
              )}
            </div>

            <div style={{padding:12,display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
              {ENTRY_FIELDS.map((field) => (
                <div className="field" key={field.key} style={{minWidth:0}}>
                  <label>{field.label}</label>
                  <input
                    type={['money','number'].includes(field.type) ? 'number' : 'text'}
                    step={field.type === 'money' ? '0.01' : field.type === 'number' ? 'any' : undefined}
                    dir={['money','number'].includes(field.type) ? 'ltr' : undefined}
                    value={row[field.key] ?? ''}
                    disabled={disabled}
                    onChange={(event)=>updateEntry(row._id, field, event.target.value)}
                    style={{width:'100%'}}
                  />
                </div>
              ))}
            </div>

            <div style={{borderTop:'1px solid var(--hair)',padding:12,display:'grid',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <strong>متابعة البند</strong>
                <span className="spacer" />
                {!disabled && <button type="button" className="btn ghost" onClick={()=>addOperationalLine(row)}>إضافة سطر</button>}
              </div>

              {lines.map((item, lineIndex) => (
                <div key={item.id} style={{display:'grid',gridTemplateColumns:'minmax(150px,1fr) minmax(0,3fr) auto',gap:8,alignItems:'start'}}>
                  <div className="field" style={{minWidth:0}}>
                    <label>العنوان</label>
                    <input
                      type="text"
                      value={item.title}
                      placeholder="اكتب عنوان السطر"
                      disabled={disabled}
                      onChange={(event)=>updateOperationalLine(row, item.id, 'title', event.target.value)}
                      style={{width:'100%'}}
                    />
                  </div>
                  <div className="field" style={{minWidth:0}}>
                    <label>التفاصيل</label>
                    <textarea
                      rows={2}
                      value={item.text}
                      disabled={disabled}
                      onChange={(event)=>updateOperationalLine(row, item.id, 'text', event.target.value)}
                      style={{width:'100%',minHeight:58,resize:'vertical'}}
                    />
                  </div>
                  {!disabled && (
                    <div style={{display:'flex',gap:4,paddingTop:25}}>
                      <button type="button" className="btn ghost" disabled={lineIndex === 0} onClick={()=>moveOperationalLine(row,item.id,-1)}>↑</button>
                      <button type="button" className="btn ghost" disabled={lineIndex === lines.length - 1} onClick={()=>moveOperationalLine(row,item.id,1)}>↓</button>
                      <button type="button" className="btn ghost" onClick={()=>deleteOperationalLine(row,item.id)}>حذف</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!safeRows.length && <div className="empty"><h3>لا توجد بنود</h3></div>}

      <div style={{borderTop:'1px solid var(--hair)',paddingTop:14,display:'grid',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <strong>أقسام إضافية</strong>
          <span className="spacer" />
          {!disabled && <button type="button" className="btn ghost" onClick={addSection}>إضافة قسم</button>}
        </div>
        {sections.map((section, index) => (
          <div key={section.id} style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) minmax(0,3fr) auto',gap:8,alignItems:'start'}}>
            <div className="field">
              <label>عنوان القسم</label>
              <input
                type="text"
                value={section.title}
                placeholder="مثال: معوقات، تسليم مسؤولية، طلبات العميل..."
                disabled={disabled}
                onChange={(event)=>updateSection(section.id,'title',event.target.value)}
              />
            </div>
            <div className="field">
              <label>النص</label>
              <textarea
                rows={3}
                value={section.text}
                disabled={disabled}
                onChange={(event)=>updateSection(section.id,'text',event.target.value)}
                style={{width:'100%',resize:'vertical'}}
              />
            </div>
            {!disabled && (
              <div style={{display:'flex',gap:4,paddingTop:25}}>
                <button type="button" className="btn ghost" disabled={index === 0} onClick={()=>moveSection(section.id,-1)}>↑</button>
                <button type="button" className="btn ghost" disabled={index === sections.length - 1} onClick={()=>moveSection(section.id,1)}>↓</button>
                <button type="button" className="btn ghost" onClick={()=>deleteSection(section.id)}>حذف</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
