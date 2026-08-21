export default function ManualProcedureFields() {
  return (
    <div className="procedure-signature-fields">
      <div className="procedure-signature-date">
        <span>التاريخ:</span>
        <span className="procedure-signature-date-dots" aria-hidden="true">
          ..........................................
        </span>
      </div>
      <div className="procedure-signature-handwriting-space" aria-hidden="true" />
      <div className="procedure-signature-sign">التوقيع:</div>
    </div>
  );
}
