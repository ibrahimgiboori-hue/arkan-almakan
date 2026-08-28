export default function PrintApprovalBlock({ declaration, parties = [] }) {
  if (!parties.length) return null;

  return (
    <section className="print-signoff-block">
      {declaration && <p className="print-signoff-declaration">{declaration}</p>}
      <div
        className="print-signoff-grid"
        style={{ '--print-signoff-columns': Math.max(1, parties.length) }}
      >
        {parties.map((party, index) => (
          <div className="print-signoff-card" key={`${party?.title || 'approval'}-${index}`}>
            <h3>{party?.title || 'اعتماد'}</h3>
            <div className="print-signoff-fields">
              {(party?.fields || []).map((rawField, fieldIndex) => {
                const field = typeof rawField === 'string' ? { label: rawField } : (rawField || {});
                if (field.hidden) return null;
                return (
                  <div className="print-signoff-field" key={`${field.label || 'field'}-${fieldIndex}`}>
                    <span className="print-signoff-label">{field.label}</span>
                    {field.value ? (
                      <strong className="print-signoff-value">{field.value}</strong>
                    ) : (
                      <span className="print-signoff-line" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
            {party?.stampLabel && (
              <div className="print-signoff-stamp">{party.stampLabel}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
