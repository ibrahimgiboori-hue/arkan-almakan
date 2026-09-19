'use client';

const WORKFLOW_STATUS={pending:'قيد الاعتماد',returned:'مُعاد للتعديل',approved:'معتمد',rejected:'مرفوض',cancelled:'ملغى'};
const DECISION_LABEL={approved:'اعتماد',routed:'توجيه',returned:'إعادة للتعديل',rejected:'رفض',cancelled:'إلغاء',pending:'قيد الانتظار'};
const LABELS={
  voucher_no:'رقم السند',voucher_date:'تاريخ السند',voucher_type:'نوع السند',amount:'المبلغ',amount_words:'المبلغ كتابة',
  party_name:'الطرف / المستفيد',party_id_number:'رقم الهوية / الإقامة',party_mobile:'الجوال',party_address:'المدينة / العنوان',
  party_nationality:'الجنسية',payment_method:'طريقة الدفع',payment_reference:'مرجع الدفع',payment_date:'تاريخ الدفع',
  description:'البيان / السبب',status:'الحالة',book_no:'رقم الدفتر',page_no:'رقم السند بالدفتر',
  project_no:'رقم المشروع',name_ar:'اسم المشروع',project_name:'المشروع',city:'المدينة',contract_value:'قيمة العقد',
  total_net:'صافي المبلغ',total_gross:'الإجمالي',total_deductions:'الاستقطاعات',run_month:'شهر المسير',
  claim_no:'رقم المستخلص',period_from:'من',period_to:'إلى',gross_amount:'الإجمالي',net_payable:'صافي المستحق',
  contractor_name:'المقاول',week_no:'الأسبوع',start_date:'من',end_date:'إلى',total_amount:'الإجمالي',
  quote_no:'رقم العرض',quote_date:'تاريخ العرض',client_name:'العميل',grand_total:'الإجمالي شامل الضريبة',
  qty:'الكمية',unit:'الوحدة',unit_price:'سعر الوحدة',sell_price:'سعر البيع',line_total:'الإجمالي',description_ar:'البيان',
};
const HIDDEN=new Set(['id','book_id','account_id','project_id','created_by','created_at','updated_at','voided_by','approval_workflow_id','treasury_movement_id','issuer_employee_id','accountant_employee_id','approved_by_employee_id','_operation']);

function label(key){return LABELS[key]||String(key||'').replaceAll('_',' ');}
function value(v){
  if(v===null||v===undefined||v==='')return '—';
  if(typeof v==='boolean')return v?'نعم':'لا';
  if(typeof v==='number')return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
  return String(v);
}
function dt(v){
  if(!v)return '—';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(d);
}

function SnapshotSection({snapshot}){
  if(!snapshot||typeof snapshot!=='object')return <div className="print-document-footer">لا توجد نسخة بيانات محفوظة.</div>;
  const scalars=Object.entries(snapshot).filter(([k,v])=>!HIDDEN.has(k)&&!Array.isArray(v)&&(v===null||typeof v!=='object'));
  const nested=Object.entries(snapshot).filter(([k,v])=>!HIDDEN.has(k)&&v&&typeof v==='object');

  return <>
    {scalars.length?<div className="print-meta-grid" data-print-grid-row data-print-grid-name="approval-snapshot-meta">
      {scalars.map(([k,v])=><div className="print-meta-item" key={k}><span>{label(k)}</span><strong>{value(v)}</strong></div>)}
    </div>:null}
    {nested.map(([k,v])=>{
      if(Array.isArray(v)){
        const rows=v.filter((row)=>row&&typeof row==='object').slice(0,150);
        if(!rows.length)return null;
        const cols=[...new Set(rows.flatMap((row)=>Object.keys(row).filter((key)=>!HIDDEN.has(key))))].slice(0,10);
        return <section key={k} style={{marginTop:'3mm'}} data-print-resizable-block>
          <h3 className="print-approval-title">{label(k)}</h3>
          <table className="print-data-table" data-print-flow="repeatable-table" data-print-grid-name={`approval-${k}`}>
            <thead><tr>{cols.map((col)=><th key={col}>{label(col)}</th>)}</tr></thead>
            <tbody>{rows.map((row,index)=><tr key={index}>{cols.map((col)=><td key={col}>{row[col]&&typeof row[col]==='object'?'—':value(row[col])}</td>)}</tr>)}</tbody>
          </table>
        </section>;
      }
      const entries=Object.entries(v).filter(([sub,val])=>!HIDDEN.has(sub)&&(val===null||typeof val!=='object'));
      if(!entries.length)return null;
      return <section key={k} style={{marginTop:'3mm'}} data-print-resizable-block>
        <h3 className="print-approval-title">{label(k)}</h3>
        <div className="print-meta-grid" data-print-grid-row data-print-grid-name={`approval-${k}`}>
          {entries.map(([sub,val])=><div className="print-meta-item" key={sub}><span>{label(sub)}</span><strong>{value(val)}</strong></div>)}
        </div>
      </section>;
    })}
  </>;
}

export default function ApprovalRecordPrint({detail,mode='incoming'}){
  const workflow=detail?.workflow||{};
  const decisions=detail?.decisions||[];
  const steps=detail?.steps||[];
  const decisionMode=mode==='decision';
  const title=decisionMode?'نسخة قرار على معاملة':'نسخة معاملة واردة للاعتماد';

  return <article className="print-document approval-record-document">
    <header className="print-document-head" data-print-resizable-block>
      <div>
        <h1 className="print-document-title">{title}</h1>
        <div className="print-document-subtitle">{workflow.source_label||'معاملة'} · {workflow.workflow_no||'—'}</div>
      </div>
      <div className={`print-document-state print-state-${workflow.status||'review'}`}>{WORKFLOW_STATUS[workflow.status]||workflow.status||'—'}</div>
    </header>

    <div className="print-meta-grid" data-print-grid-row data-print-grid-name="approval-record-head">
      <div className="print-meta-item"><span>رقم مسار الاعتماد</span><strong>{workflow.workflow_no||'—'}</strong></div>
      <div className="print-meta-item"><span>نوع المعاملة</span><strong>{workflow.transaction_type||'—'}</strong></div>
      <div className="print-meta-item"><span>النسخة</span><strong>{workflow.version_no||1}</strong></div>
      <div className="print-meta-item"><span>تاريخ الإرسال</span><strong>{dt(workflow.submitted_at)}</strong></div>
    </div>

    <section data-print-resizable-block>
      <h2 className="print-approval-title">المستند / البيانات كما أُرسلت للاعتماد</h2>
      <SnapshotSection snapshot={detail?.snapshot}/>
    </section>

    {decisionMode?<section className="print-approval-block" data-print-resizable-block>
      <h2 className="print-approval-title">نتيجة القرارات المسجلة</h2>
      {decisions.length? <table className="print-data-table" data-print-flow="repeatable-table" data-print-grid-name="approval-decisions">
        <thead><tr><th>الإجراء</th><th>القائم بالإجراء</th><th>الصفة</th><th>التاريخ</th><th>التهميش</th></tr></thead>
        <tbody>{decisions.map((item)=><tr key={item.id}>
          <td>{item.decision_label||DECISION_LABEL[item.decision]||item.decision||'—'}</td>
          <td>{item.actor_name||'—'}</td>
          <td>{item.actor_position||item.actor_job_title||'—'}</td>
          <td>{dt(item.decided_at)}</td>
          <td>{item.comment||'—'}</td>
        </tr>)}</tbody>
      </table>:<div className="print-document-footer">لا يوجد قرار مسجل على هذه النسخة حتى الآن.</div>}
    </section>:null}

    <section className="print-approval-block" data-print-resizable-block>
      <h2 className="print-approval-title">مسار المعاملة</h2>
      <div className="print-approval-list">
        {steps.map((step)=><div className="print-approval-step" key={step.id}>
          <strong>الخطوة {step.step_order} · {step.target_group_label||'الجهة المختصة'}</strong>
          <span>{DECISION_LABEL[step.status]||step.status||'—'}</span>
          {step.request_reason?<small>سبب التوجيه: {step.request_reason}</small>:null}
          {step.decision_comment?<small>التهميش: {step.decision_comment}</small>:null}
          {step.acted_at?<small>التاريخ: {dt(step.acted_at)}</small>:null}
        </div>)}
      </div>
    </section>

    <footer className="print-document-footer">هذه النسخة مولدة من سجل المعاملة المحفوظ في النظام، ولا تعيد تفسير البيانات التاريخية بعد صدور القرار.</footer>
  </article>;
}
