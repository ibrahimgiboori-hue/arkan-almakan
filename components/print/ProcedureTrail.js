'use client';
import { dateAr } from '@/lib/format';
import { getApprovalActionLabel, getWorkflowActions, manualProcedureRoles } from '@/lib/workflow-actions';
import ManualProcedureFields from '@/components/print/ManualProcedureFields';

function v(x) { return x == null || x === '' ? '—' : x; }

export default function ProcedureTrail({
  approvals = [],
  transactionType = 'generic',
  exceptional = false,
  manualLeadLabel = null,
  parallelManualLabels = [],
}) {
  const flow = getWorkflowActions(transactionType, { exceptional });
  const manualRoles = manualProcedureRoles(transactionType, {
    exceptional,
    leadLabel: manualLeadLabel,
    parallelLabels: parallelManualLabels,
  });

  return (
    <>
      {approvals.length > 0 && (
        <div className="procedure-electronic">
          <div className="xlsx-grid">
            <div className="xlsx-cell xlsx-section s12">سجل الإجراءات الإلكترونية</div>
            <div className="xlsx-cell xlsx-head s3">الإجراء</div>
            <div className="xlsx-cell xlsx-head s3">القائم بالإجراء</div>
            <div className="xlsx-cell xlsx-head s4">الصفة</div>
            <div className="xlsx-cell xlsx-head s2">التاريخ</div>
            {approvals.map((a) => (
              <div key={a.id} style={{display:'contents'}}>
                <div className="xlsx-cell xlsx-value s3">{getApprovalActionLabel(a, flow)}</div>
                <div className="xlsx-cell xlsx-value s3">{v(a.actor_name)}</div>
                <div className="xlsx-cell xlsx-value s4">{v(a.actor_title)}</div>
                <div className="xlsx-cell xlsx-value s2">{dateAr(a.decision_date)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {manualRoles.length > 0 && (
        <div className="procedure-manual">
          <div className="procedure-signature-grid" style={{'--procedure-stage-columns': manualRoles.length}}>
            {manualRoles.map((label, i) => (
              <div className="procedure-signature-slot" key={`${label}-${i}`}>
                <b className="procedure-signature-role">{label}</b>
                <ManualProcedureFields />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
