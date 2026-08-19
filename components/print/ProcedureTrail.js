'use client';
import { dateAr } from '@/lib/format';
import { getApprovalActionLabel, getWorkflowActions, manualProcedureRoles } from '@/lib/workflow-actions';

function v(x) { return x == null || x === '' ? '—' : x; }

function spanFor(index, count) {
  if (!count) return 12;
  const base = Math.floor(12 / count);
  if (index === count - 1) return 12 - base * (count - 1);
  return base;
}

export default function ProcedureTrail({
  approvals = [],
  transactionType = 'generic',
  exceptional = false,
  manualLeadLabel = null,
}) {
  const flow = getWorkflowActions(transactionType, { exceptional });
  const manualRoles = manualProcedureRoles(transactionType, { exceptional, leadLabel:manualLeadLabel });

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
          <div className="xlsx-grid">
            {manualRoles.map((label, i) => (
              <div
                key={`${label}-${i}`}
                className="xlsx-cell xlsx-sign"
                style={{gridColumn:`span ${spanFor(i, manualRoles.length)}`}}
              >
                <b>{label}</b>
                <span>الاسم والتوقيع</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
