'use client';
import { dateAr } from '@/lib/format';
import ManualProcedureFields from '@/components/print/ManualProcedureFields';

export default function ProcedureStagePanel({ electronic = [], manual = [] }) {
  if (!electronic.length && !manual.length) return null;

  return (
    <>
      {electronic.length > 0 && (
        <div className="procedure-electronic">
          <div className="xlsx-grid" style={{marginTop:'2.2mm'}}>
            <div className="xlsx-cell xlsx-section s12">سجل الإجراءات الإلكترونية</div>
          </div>
          <div className="procedure-stage-grid" style={{'--procedure-stage-columns': electronic.length}}>
            {electronic.map((slot, i) => (
              <div className="procedure-stage-slot" key={slot.key || `${slot.action || 'إجراء'}-${i}`}>
                <b className="procedure-stage-action">{slot.action || 'إجراء'}</b>
                {slot.actor && <strong className="procedure-stage-actor">{slot.actor}</strong>}
                {slot.title && <span className="procedure-stage-title">{slot.title}</span>}
                <small className="procedure-stage-meta">
                  {slot.state || 'بانتظار الإجراء'}{slot.date ? ` · ${dateAr(slot.date)}` : ''}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {manual.length > 0 && (
        <div className="procedure-manual">
          <div className="procedure-signature-grid" style={{'--procedure-stage-columns': manual.length}}>
            {manual.map((slot, i) => {
              const item = typeof slot === 'string' ? { label:slot } : (slot || {});
              return (
                <div className="procedure-signature-slot" key={`${item.label || 'إجراء'}-${i}`}>
                  <b className="procedure-signature-role">{item.label || 'إجراء'}</b>
                  {item.name && <strong className="procedure-signature-name">{item.name}</strong>}
                  <ManualProcedureFields />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
