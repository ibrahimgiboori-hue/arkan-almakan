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
    ? 'موظف بديل مؤقت'
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
      state:slotState(hrApproval,{approved:'تم الإجراء',pending:'بانتظار الإجراء',rejected:'مرفوض'}),
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
      <style>{`
        .leave-procedure-manual{display:none}
        .leave-procedure-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:.22mm solid #9b9b9b;border-right:.22mm solid #9b9b9b;margin-top:2.2mm}
        .leave-procedure-slot{min-height:23mm;border-left:.22mm solid #9b9b9b;border-bottom:.22mm solid #9b9b9b;padding:1.4mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:.8mm;background:#fff}
        .leave-procedure-slot b{color:#7C2B28;font-size:8.2pt}
        .leave-procedure-slot strong{font-size:8.1pt;color:#222}
        .leave-procedure-slot span,.leave-procedure-slot small{font-size:7.2pt;color:#555}
        .leave-procedure-manual .leave-procedure-slot{min-height:18mm;justify-content:space-between}
        .leave-sign-line{width:78%;border-top:.2mm solid #777;padding-top:1mm;margin-top:2mm;font-size:7pt}
        @media print{
          .leave-procedure-electronic{display:none!important}
          .leave-procedure-manual{display:block!important}
        }
      `}</style>

      <div className="leave-procedure-electronic">
        <div className="xlsx-grid" style={{marginTop:'2.2mm'}}>
          <div className="xlsx-cell xlsx-section s12">سجل الإجراءات الإلكترونية</div>
        </div>
        <div className="leave-procedure-grid">
          {electronic.map((slot) => (
            <div className="leave-procedure-slot" key={slot.key}>
              <b>{slot.action}</b>
              <strong>{slot.actor}</strong>
              <span>{slot.title}</span>
              <small>{slot.state}{slot.date ? ` · ${dateAr(slot.date)}` : ''}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="leave-procedure-manual">
        <div className="leave-procedure-grid">
          {manual.map((slot) => (
            <div className="leave-procedure-slot" key={slot.label}>
              <b>{slot.label}</b>
              {slot.name && <strong>{slot.name}</strong>}
              <div className="leave-sign-line">الاسم والتوقيع</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
