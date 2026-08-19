'use client';
import { dateAr } from '@/lib/format';

function slotState(approval, { approved='تم', pending='بانتظار الإجراء', rejected='مرفوض' } = {}) {
  if (!approval) return pending;
  if (approval.decision === 'rejected') return rejected;
  return approved;
}

export default function LeaveProcedurePanel({
  approvals = [],
  exceptional = false,
  substitute = null,
  expectedFinalApprover = null,
}) {
  const substituteApproval = approvals.find((a) => a.action_code === 'substitute_consent');
  const finalApproval = approvals.find((a) => a.action_code === 'final_approval' || a.is_final_action);
  const hrApproval = approvals.find((a) => a.action_code !== 'substitute_consent' && a.action_code !== 'final_approval' && !a.is_final_action);

  const hrAction = exceptional ? 'إعداد وتسجيل الطلب' : 'مراجعة وموافقة';
  const substituteName = substitute?.full_name_ar || 'غير محدد';
  const substituteTitle = substitute?.employment_kind === 'temporary_replacement'
    ? 'بديل مؤقت'
    : (substitute?.job_title || 'موظف بديل');
  const hrName = hrApproval?.actor_name || 'الموارد البشرية';
  const hrTitle = hrApproval?.actor_title || 'الموارد البشرية';
  const finalName = finalApproval?.actor_name || expectedFinalApprover?.full_name_ar || 'بانتظار الاعتماد';
  const finalTitle = finalApproval?.actor_title || expectedFinalApprover?.job_title || expectedFinalApprover?.board_role || 'الاعتماد النهائي';

  const electronic = [
    {
      key:'substitute', action:'موافقة الموظف البديل', actor:substituteName, title:substituteTitle,
      state:slotState(substituteApproval,{approved:'موافق',pending:'بانتظار الموافقة',rejected:'غير موافق'}),
      date:substituteApproval?.decision_date,
    },
    {
      key:'hr', action:hrAction, actor:hrName, title:hrTitle,
      state:slotState(hrApproval,{approved:'تم',pending:'بانتظار الإجراء',rejected:'مرفوض'}),
      date:hrApproval?.decision_date,
    },
    {
      key:'final', action:'اعتماد نهائي', actor:finalName, title:finalTitle,
      state:slotState(finalApproval,{approved:'معتمد',pending:'بانتظار الاعتماد',rejected:'مرفوض'}),
      date:finalApproval?.decision_date,
    },
  ];

  const manual = [
    { label:'الموظف البديل', name:substituteName },
    { label:'الموارد البشرية', name:hrApproval?.actor_name || '' },
    { label:'الاعتماد النهائي', name:expectedFinalApprover?.full_name_ar || finalApproval?.actor_name || '' },
  ];

  return (
    <>
      <div className="procedure-electronic">
        <div className="xlsx-grid" style={{marginTop:'2.2mm'}}>
          <div className="xlsx-cell xlsx-section s12">سجل الإجراءات الإلكترونية</div>
        </div>
        <div className="procedure-stage-grid" style={{'--procedure-stage-columns': electronic.length}}>
          {electronic.map((slot) => (
            <div className="procedure-stage-slot" key={slot.key}>
              <b className="procedure-stage-action">{slot.action}</b>
              <strong className="procedure-stage-actor">{slot.actor}</strong>
              <span className="procedure-stage-title">{slot.title}</span>
              <small className="procedure-stage-meta">
                {slot.state}{slot.date ? ` · ${dateAr(slot.date)}` : ''}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="procedure-manual">
        <div className="procedure-signature-grid" style={{'--procedure-stage-columns': manual.length}}>
          {manual.map((slot) => (
            <div className="procedure-signature-slot" key={slot.label}>
              <b className="procedure-signature-role">{slot.label}</b>
              {slot.name && <strong className="procedure-signature-name">{slot.name}</strong>}
              <div className="procedure-signature-line">الاسم والتوقيع</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
