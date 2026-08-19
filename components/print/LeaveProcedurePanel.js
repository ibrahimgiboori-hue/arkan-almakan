'use client';
import ProcedureStagePanel from '@/components/print/ProcedureStagePanel';

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

  return <ProcedureStagePanel electronic={electronic} manual={manual} />;
}
