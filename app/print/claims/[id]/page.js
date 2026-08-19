'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr, dateRange, money, qty, unitLabel } from '@/lib/format';
import Riyal from '@/components/Riyal';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import FinancialPaymentGrid from '@/components/print/FinancialPaymentGrid';
import ProcedureStagePanel from '@/components/print/ProcedureStagePanel';

const DOCS = {
  measure:'محضر قياس وحصر الأعمال',
  demand:'المطالبة المالية',
  receipt:'إشعار استلام دفعة',
  memo:'مذكرة داخلية لطلب إصدار فاتورة ضريبية',
};
const n = v => Number(v || 0);

function employeeTitle(e) {
  if (!e) return '';
  const role=String(e.board_role || '').trim();
  const job=String(e.job_title || '').trim();
  if (e.person_kind==='board') return [role,job].filter(Boolean).join(' و');
  return job;
}

export default function ClaimDocumentsPrint() {
  const { id }=useParams();
  const sp=useSearchParams();
  const [doc,setDoc]=useState(sp.get('doc') || 'demand');
  const [claim,setClaim]=useState(null);
  const [project,setProject]=useState(null);
  const [rows,setRows]=useState([]);
  const [cfg,setCfg]=useState(null);
  const [supervisor,setSupervisor]=useState(null);
  const [finance,setFinance]=useState(null);
  const [creator,setCreator]=useState(null);
  const [collectionRecorder,setCollectionRecorder]=useState(null);
  const [clientContact,setClientContact]=useState('');
  const [showLetterhead,setShowLetterhead]=useState(true);
  const [showStamp,setShowStamp]=useState(false);
  const [err,setErr]=useState('');

  useEffect(()=>setDoc(sp.get('doc') || 'demand'),[sp]);

  useEffect(()=>{
    if (!id) return;
    (async()=>{
      try {
        const { data:c,error:ce }=await supabase.from('progress_claims').select('*').eq('id',id).maybeSingle();
        if (ce) throw ce;
        if (!c) throw new Error('المستخلص غير موجود');
        setClaim(c);

        const actorUserIds=[...new Set([
          c.created_by,
          c.measurement_recorded_by_user_id,
          c.collection_recorded_by_user_id,
          c.invoice_recorded_by_user_id,
        ].filter(Boolean))];
        const actorUsersPromise=actorUserIds.length
          ? supabase.from('app_users').select('id,employee_id').in('id',actorUserIds)
          : Promise.resolve({data:[]});

        const [pc,rawProject,lineRes,settingsRes,peopleRes,actorUsersRes]=await Promise.all([
          supabase.from('v_project_client').select('*').eq('project_id',c.project_id).maybeSingle(),
          supabase.from('projects').select('supervisor_id,entity_id').eq('id',c.project_id).maybeSingle(),
          supabase.from('claim_lines').select('*').eq('claim_id',id),
          supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
          supabase.from('employees').select('id,full_name_ar,person_kind,board_role,job_title,status').in('status',['active','on_leave']),
          actorUsersPromise,
        ]);
        setProject(pc.data || null);
        setCfg(settingsRes.data || {});

        const rawLines=lineRes.data || [];
        const itemIds=[...new Set(rawLines.map(x=>x.project_item_id).filter(Boolean))];
        const itemMap={};
        if (itemIds.length) {
          const { data:its }=await supabase.from('project_items').select('id,description_ar,unit').in('id',itemIds);
          (its || []).forEach(x=>{ itemMap[x.id]=x; });
        }
        setRows(rawLines.map(x=>({
          ...x,
          description:x.description_snapshot || itemMap[x.project_item_id]?.description_ar || '—',
          unit:x.unit_snapshot || itemMap[x.project_item_id]?.unit || '—',
        })));

        let people=[...(peopleRes.data || [])];
        const actorUsers=actorUsersRes.data || [];
        const actorEmployeeIds=[...new Set(actorUsers.map(x=>x.employee_id).filter(Boolean))];
        const missingActorEmployees=actorEmployeeIds.filter(empId=>!people.some(p=>p.id===empId));
        if (missingActorEmployees.length) {
          const { data:extraPeople }=await supabase.from('employees')
            .select('id,full_name_ar,person_kind,board_role,job_title,status')
            .in('id',missingActorEmployees);
          people=[...people,...(extraPeople || [])];
        }
        const employeeById=Object.fromEntries(people.map(p=>[p.id,p]));
        const employeeIdByUser=Object.fromEntries(actorUsers.map(u=>[u.id,u.employee_id]));
        const actorOf=(userId)=>employeeById[employeeIdByUser[userId]] || null;
        setCreator(actorOf(c.created_by));
        setCollectionRecorder(actorOf(c.collection_recorded_by_user_id));

        if (rawProject.data?.supervisor_id) {
          const s=employeeById[rawProject.data.supervisor_id];
          if (s) setSupervisor(s);
          else {
            const { data }=await supabase.from('employees').select('id,full_name_ar,person_kind,board_role,job_title').eq('id',rawProject.data.supervisor_id).maybeSingle();
            setSupervisor(data || null);
          }
        }
        const fin=people.find(x=>String(x.job_title || '').includes('مراقب') && String(x.job_title || '').includes('مالي'))
          || people.find(x=>String(x.job_title || '').includes('مالي'));
        setFinance(fin || null);
        if (rawProject.data?.entity_id) {
          const { data:ent }=await supabase.from('entities').select('contact_name').eq('id',rawProject.data.entity_id).maybeSingle();
          setClientContact(ent?.contact_name || '');
        }
      } catch(e) { setErr(e.message || String(e)); }
    })();
  },[id]);

  // المطبوع لا يعيد احتساب المعاملة: يعرض القيم المحفوظة في المستخلص فقط.
  const values=useMemo(()=>{
    if (!claim) return {};
    return {
      base:n(claim.taxable_base ?? claim.gross_amount),
      vat:n(claim.vat_amount),
      net:n(claim.net_payable),
      paid:n(claim.collected_amount),
      rate:n(claim.vat_rate) || n(project?.vat_rate) || 0.15,
    };
  },[claim,project]);

  if (err) return <div style={{padding:40,direction:'rtl'}}>{err}</div>;
  if (!claim || !cfg) return <div style={{padding:40,direction:'rtl'}}>جارٍ التحميل</div>;

  const title=DOCS[doc] || DOCS.demand;
  const projectName=project?.project_name || '—';
  const clientName=project?.client_name || '—';
  const measuredRows=rows.filter(r=>r.measurement_id);
  const measurementCount=measuredRows.length;
  const overallRange=dateRange(claim.period_from,claim.period_to);
  const issueDate=doc==='receipt' || doc==='memo'
    ? (claim.collected_at || claim.owner_approved_at || claim.period_to)
    : (doc==='measure' ? claim.period_to : (claim.submitted_at || claim.period_to));
  const supervisorName=supervisor?.full_name_ar || 'ممثل إدارة المشاريع';
  const financeName=finance?.full_name_ar || 'مسؤول الإدارة المالية';
  const financeTitle=employeeTitle(finance);
  const creatorName=creator?.full_name_ar || 'مسجل المعاملة';
  const creatorTitle=employeeTitle(creator) || 'إعداد المعاملة';
  const collectionName=collectionRecorder?.full_name_ar || finance?.full_name_ar || 'الإدارة المالية';
  const collectionTitle=employeeTitle(collectionRecorder) || employeeTitle(finance) || 'تسجيل السداد';
  const hasBankDetails=Boolean(String(cfg.bank_iban || '').trim() && (String(cfg.bank_name_full || '').trim() || String(cfg.bank_account_no || '').trim()));

  const measurementWording=measurementCount>1
    ? 'وفق فترات القياس المبينة لكل بند في الجدول أدناه'
    : `عن الفترة ${overallRange}`;

  const letter=doc==='measure'
    ? `بالإشارة إلى الأعمال الجارية في مشروع ${projectName}، نفيدكم بأنه تم قياس وحصر الأعمال الموضحة أدناه بواسطة ${supervisorName}، وبحضور ممثليكم ومشرفي الموقع، ${measurementWording}.\n\nوقد أسفر القياس عن الكميات الموضحة في الجدول أدناه، وتُعد معتمدة ومتفقاً عليها بين الطرفين حال توقيع هذا المحضر.`
    : doc==='demand'
    ? `بالإشارة إلى الأعمال المنفذة في مشروع ${projectName}، وبناءً على محاضر قياس وحصر الأعمال الموضحة أدناه، نتقدم إليكم بالمطالبة المالية وفق الكميات والقيم وفترات القياس المبينة لكل بند.\n\nنأمل التكرم باعتمادها وصرف المستحقات وفق شروط التعاقد، وتحويل المبلغ المستحق إلى الحساب الموضح أدناه مع ذكر رقم المستخلص في مرجع التحويل.`
    : doc==='receipt'
    ? `نفيدكم باستلام مبلغ ${money(values.paid || values.net)} ريال عن المستخلص رقم (${claim.seq_no || claim.claim_no}) الخاص بالأعمال المنفذة والمقاسة في مشروع ${projectName}${claim.collected_at ? `، بموجب تحويل بتاريخ ${dateAr(claim.collected_at)}` : ''}.\n\nومرفق ما يثبت التحويل، شاكرين لكم حسن تعاونكم.`
    : `نفيدكم بسداد السادة / ${clientName} مبلغ ${money(values.paid || values.net)} ريال عن المستخلص رقم (${claim.seq_no || claim.claim_no}) لمشروع ${projectName}، وذلك عن الأعمال المنفذة والمقاسة المبينة بالمستخلص وفق فترات القياس المثبتة لكل بند، وبموجب إيصال التحويل المرفق${claim.collect_ref ? ` رقم ${claim.collect_ref}` : ''}${claim.collected_at ? ` بتاريخ ${dateAr(claim.collected_at)}` : ''}.\n\nنأمل التكرم بإصدار الفاتورة الضريبية من نظام الفوترة الخاص بالمنشأة، وإرسالها إلى الأستاذ / ${clientContact || '(مسؤول التواصل لدى الجهة)'}.\n\nهذه المذكرة داخلية ولا تُعد فاتورة ضريبية ولا تقوم مقامها.`;

  const submittedDone=Boolean(claim.submitted_at || ['submitted','owner_approved','invoiced','collected'].includes(claim.status));
  const ownerDone=Boolean(claim.owner_approved_at || ['owner_approved','invoiced','collected'].includes(claim.status));
  const collectedDone=Boolean(claim.collected_at || claim.status==='collected');
  const electronicStages=[
    {
      key:'prepare',
      action:doc==='measure' ? 'إعداد محضر القياس' : doc==='demand' ? 'إعداد المطالبة' : doc==='receipt' ? 'إعداد إشعار الاستلام' : 'إعداد المذكرة',
      actor:doc==='measure' ? supervisorName : creatorName,
      title:doc==='measure' ? (employeeTitle(supervisor) || 'إدارة المشاريع') : creatorTitle,
      state:'تم الإعداد',
      date:doc==='measure' ? (claim.measurement_date || claim.created_at) : claim.created_at,
    },
  ];
  if (doc!=='measure') {
    electronicStages.push(
      {
        key:'submitted', action:'تقديم المطالبة', actor:creatorName, title:creatorTitle,
        state:submittedDone ? 'تم التقديم' : 'بانتظار التقديم', date:claim.submitted_at,
      },
      {
        key:'owner', action:'اعتماد الجهة', actor:clientContact || clientName, title:'الجهة / العميل',
        state:ownerDone ? 'معتمد' : 'بانتظار الاعتماد', date:claim.owner_approved_at,
      },
    );
  }
  if (doc==='receipt' || doc==='memo') {
    electronicStages.push({
      key:'collection', action:'تسجيل السداد', actor:collectionName, title:collectionTitle,
      state:collectedDone ? 'تم السداد' : 'بانتظار السداد', date:claim.collected_at,
    });
  }

  const manualStages=doc==='measure'
    ? [
        {label:'ممثل أركان المكان',name:supervisor?.full_name_ar || ''},
        {label:'ممثل الجهة',name:clientContact || ''},
        {label:'الاعتماد'},
      ]
    : doc==='demand'
    ? [
        {label:'إعداد المطالبة',name:creator?.full_name_ar || ''},
        {label:'مراجعة مالية',name:finance?.full_name_ar || ''},
        {label:'اعتماد الجهة',name:clientContact || ''},
      ]
    : doc==='receipt'
    ? [
        {label:'تسجيل الاستلام',name:collectionRecorder?.full_name_ar || ''},
        {label:'مراجعة مالية',name:finance?.full_name_ar || ''},
        {label:'الاعتماد'},
      ]
    : [
        {label:'مقدم الطلب',name:creator?.full_name_ar || ''},
        {label:'مراجعة مالية',name:finance?.full_name_ar || ''},
        {label:'الاعتماد'},
      ];

  function printDocument() {
    if (doc==='demand' && !hasBankDetails) {
      window.alert('لا يمكن طباعة المطالبة المالية قبل استكمال بيانات حساب التحصيل في إعدادات المنشأة.');
      return;
    }
    window.print();
  }

  return <>
    <div className="print-toolbar no-print">
      <div className="group">{Object.entries(DOCS).map(([k,v])=><button key={k} className={doc===k?'active':''} onClick={()=>setDoc(k)}>{v}</button>)}</div>
      <div className="group">
        {doc==='memo' && !claim.collected_at && <span className="note">لم يتم تسجيل السداد بعد؛ راجع توقيت إصدار المذكرة قبل الطباعة.</span>}
        {doc==='receipt' && !claim.collected_at && <span className="note">لا يوجد تاريخ سداد مسجل لهذا المستخلص.</span>}
        {doc==='demand' && !hasBankDetails && <span className="note">استكمل بيانات حساب التحصيل قبل طباعة المطالبة.</span>}
        <button className={showLetterhead?'active':''} onClick={()=>setShowLetterhead(x=>!x)}>{showLetterhead?'المطبوع ظاهر':'المطبوع مخفي'}</button>
        <button className={showStamp?'active':''} onClick={()=>setShowStamp(x=>!x)}>{showStamp?'الختم ظاهر':'الختم مخفي'}</button>
        <button className="primary" onClick={printDocument}>طباعة أو حفظ PDF</button>
      </div>
    </div>

    <ConstitutionPrintFrame documentKey="claim_documents" cfg={cfg} showLetterhead={showLetterhead} showStamp={showStamp}>
      <div className="project-finance-document">
      <div className="doc-meta"><span>{cfg.company_name_ar}</span><span>{dateAr(issueDate)}</span></div>
      <div className="doc-title"><h1>{title}</h1><span className="rule" /></div>

      {doc!=='memo'
        ? <><div className="recipient">السادة / {clientName} المحترمين</div><div className="salutation">السلام عليكم ورحمة الله وبركاته،،</div></>
        : <><div className="recipient">سعادة الأستاذ / {financeName}<br />{financeTitle ? `${financeTitle} - الموقر` : 'الموقر'}</div><div className="salutation">السلام عليكم ورحمة الله وبركاته،،</div></>}

      <p className="letter-body">{letter}</p>

      <table className="info-table"><tbody>
        <tr><th>المشروع</th><td>{projectName}</td><th>رقم المشروع</th><td>{project?.project_no || '—'}</td></tr>
        <tr><th>الموقع</th><td>{project?.site_address || project?.city || '—'}</td><th>نطاق القياسات</th><td className="mono">{overallRange}</td></tr>
        <tr><th>رقم المستخلص</th><td>{claim.claim_no || '—'}</td><th>عدد التمتيرات</th><td>{measurementCount || '—'}</td></tr>
      </tbody></table>

      {(doc==='measure' || doc==='demand') && <>
        <div className="section-title">الأعمال المنفذة والمقاسة</div>
        <table className="data-table claim-lines-table">
          <thead><tr>
            <th data-print-column-role="row-index" style={{width:'6mm'}}>م</th>
            <th data-print-column-role="text">البيان</th>
            {measurementCount>0 && <>
              <th data-print-column-role="measurement-number" style={{width:'12mm'}}>التمتير</th>
              <th data-print-column-role="date-range" style={{width:'43mm'}}>فترة القياس</th>
            </>}
            <th data-print-column-role="unit" style={{width:'12mm'}}>الوحدة</th>
            <th data-print-column-role="quantity" className="num" style={{width:'15mm'}}>الكمية</th>
            {doc==='demand' && <>
              <th data-print-column-role="unit-price" className="num" style={{width:'17mm'}}>سعر الوحدة</th>
              <th data-print-column-role="amount" className="num" style={{width:'21mm'}}>القيمة</th>
            </>}
          </tr></thead>
          <tbody>
            {rows.map((r,i)=><tr key={r.id || i}>
              <td data-print-column-role="row-index">{i+1}</td>
              <td data-print-column-role="text">{r.description}</td>
              {measurementCount>0 && <>
                <td data-print-column-role="measurement-number">{r.measurement_no_snapshot || '—'}</td>
                <td data-print-column-role="date-range" className="mono">{r.measurement_id ? dateRange(r.measurement_period_from,r.measurement_period_to) : '—'}</td>
              </>}
              <td data-print-column-role="unit">{unitLabel(r.unit)}</td>
              <td data-print-column-role="quantity" className="num">{qty(r.qty_this)}</td>
              {doc==='demand' && <>
                <td data-print-column-role="unit-price" className="num">{money(r.unit_price)}</td>
                <td data-print-column-role="amount" className="num">{r.amount == null ? '—' : money(r.amount)}</td>
              </>}
            </tr>)}
            {!rows.length && <tr><td colSpan={doc==='demand' ? (measurementCount>0?8:6) : (measurementCount>0?6:4)}>لا توجد بنود مسجلة في هذا المستخلص.</td></tr>}
          </tbody>
        </table>
      </>}

      {doc!=='measure' && <>
        <div className="section-title">الملخص المالي</div>
        <table className="summary-table"><tbody>
          <tr><td>قيمة الأعمال لهذا المستخلص</td><td className="num">{money(values.base)} <Riyal /></td></tr>
          <tr><td>ضريبة القيمة المضافة {(values.rate*100).toFixed(0)}%</td><td className="num">{money(values.vat)} <Riyal /></td></tr>
          {n(claim.retention_amount)>0 && <tr><td>المحتجزات</td><td className="num">{money(claim.retention_amount)} <Riyal /></td></tr>}
          {n(claim.advance_recovery)>0 && <tr><td>استرداد الدفعة المقدمة</td><td className="num">{money(claim.advance_recovery)} <Riyal /></td></tr>}
          {n(claim.other_deductions)>0 && <tr><td>خصومات أخرى</td><td className="num">{money(claim.other_deductions)} <Riyal /></td></tr>}
          <tr className="total"><td>صافي المستحق</td><td className="num">{money(values.net)} <Riyal /></td></tr>
          {(doc==='receipt' || doc==='memo') && <tr><td>المبلغ المسدد</td><td className="num">{money(values.paid || values.net)} <Riyal /></td></tr>}
        </tbody></table>
      </>}

      {doc==='demand' && <>
        <div className="section-title">بيانات السداد</div>
        <FinancialPaymentGrid
          beneficiary={cfg.company_name_ar}
          bank={cfg.bank_name_full}
          accountNo={cfg.bank_account_no}
          iban={cfg.bank_iban}
          reference={`المستخلص رقم ${claim.claim_no || claim.seq_no || '—'}`}
        />
      </>}

      <ProcedureStagePanel electronic={electronicStages} manual={manualStages} />
      </div>
    </ConstitutionPrintFrame>
  </>;
}
