'use client';
import ManualProcedureFields from '@/components/print/ManualProcedureFields';

export default function ManualProcedureGrid({ slots = [] }) {
  if (!slots.length) return null;
  return (
    <div className="procedure-manual">
      <div className="procedure-signature-grid" style={{ '--procedure-stage-columns': slots.length }}>
        {slots.map((slot, i) => {
          const item = typeof slot === 'string' ? { label: slot } : (slot || {});
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
  );
}
