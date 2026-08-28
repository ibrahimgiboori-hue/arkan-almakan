export default function PrintApprovalBlock({ declaration, parties = [] }) {
  if (!parties.length) return null;

  const reserveStampSpace = parties.some((party) => party?.stampLabel);

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
              {(party?.fields || []).map((field, fieldIndex) => (
                <div className="print-signoff-field" key={`${field}-${fieldIndex}`}>
                  <span className="print-signoff-label">{field}</span>
                  <span className="print-signoff-line" aria-hidden="true" />
                </div>
              ))}
            </div>
            {reserveStampSpace && (
              <div className={`print-signoff-stamp ${party?.stampLabel ? '' : 'is-empty'}`}>
                {party?.stampLabel || '\u00a0'}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
