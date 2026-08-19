'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr, money, qty } from '@/lib/format';
import Riyal from '@/components/Riyal';
import PrintFrame from '@/components/print/PrintFrame';
import '../print.css';

const DOCS = {
  measure: 'محضر قياس وحصر الأعمال',
  demand: 'المطالبة المالية',
  receipt: 'إشعار استلام دفعة',
  memo: 'مذكرة داخلية لطلب إصدار فاتورة ضريبية',
};

const n = (v) => Number(v || 0);

function employeeTitle(e) {
  if (!e) return '';
  const role = String(e.board_role || '').trim();
  const job = String(e.job_title || '').trim();
  if (e.person_kind === 'board') return [role, job].filter(Boolean).join(' و');
  return job;
}

function Signatures({ labels }) {
  return (
    <table className="sign-table">
      <thead><tr>{labels.map((x)=><th key={x}>{x}</th>)}</tr></thead>
      <tbody><tr>{labels.map((x)=><td key={x}>الاسم والتوقيع</td>)}</tr></tbody>
    </table>
  );
}

export default function ClaimDocumentsPrint() {
  const { id } = useParams();
  const sp = useSearchParams();
  const [doc, setDoc] = useState(sp.get('doc') || 'demand');
  const [claim, setClaim] = useState(null);
  const [project, setProject] = useState(null);
  const [rows, setRows] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [finance, setFinance] = useState(null);
  const [clientContact, setClientContact] = useState('');
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [showStamp, setShowStamp] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setDoc(sp.get('doc') || 'demand');
  }, [sp]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data: c, error: ce } = await supabase.from('progress_claims').select('*').eq('id', id).maybeSingle();
        if (ce) throw ce;
        if (!c) throw new Error('المستخلص غير موجود');
        setClaim(c);

        const [pc, rawProject, lineRes, settingsRes, peopleRes] = await Promise.all([
          supabase.from('v_project_client').select('*').eq('project_id', c.project_id).maybeSingle(),
          supabase.from('projects').select('supervisor_id, entity_id').eq('id', c.project_id).maybeSingle(),
          supabase.from('claim_lines').select('*').eq('claim_id', id),
          supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('employees').select('id, full_name_ar, person_kind, board_role, job_title, status').in('status',['active','on_leave']),
        ]);

        setProject(pc.data || null);
        setCfg(settingsRes.data || {});

        const itemIds = [...new Set((lineRes.data || []).map((x)=>x.project_item_id).filter(Boolean))];
        let itemMap = {};
        if (itemIds.length) {
          const { data: items } = await supabase.from('project_items').select('id, description_ar, unit').in('id', itemIds);
          (items || []).forEach((x)=>{ itemMap[x.id] = x; });
        }
        setRows((lineRes.data || []).map((x)=>({
          ...x,
          description: itemMap[x.project_item_id]?.description_ar || '—',
          unit: itemMap[x.project_item_id]?.unit || '—',
        })));

        if (rawProject.data?.supervisor_id) {
          const s = (peopleRes.data || []).find((x)=>x.id === rawProject.data.supervisor_id);
          if (s) setSupervisor(s);
          else {
            const { data } = await supabase.from('employees').select('id, full_name_ar, person_kind, board_role, job_title').eq('id', rawProject.data.supervisor_id).maybeSingle();
            setSupervisor(data || null);
          }
        }

        const fin = (peopleRes.data || []).find((x)=>{
          const t = String(x.job_title || '');
          return t.includes('مراقب') && t.includes('مالي');
        }) || (peopleRes.data || []).find((x)=>String(x.job_title || '').includes('مالي'));
        setFinance(fin || null);

        if (rawProject.data?.entity_id) {
          const { data: ent } = await supabase.from('entities').select('contact_name').eq('id', rawProject.data.entity_id).maybeSingle();
          setClientContact(ent?.contact_name || '');
        }
      } catch (e) {
        setErr(e.message || String(e));
      }
    })();
  }, [id]);

  const values = useMemo(() => {
    if (!claim) return {};
    const base = n(claim.taxable_base) || Math.max(0, n(claim.gross_amount) - n(claim.prev_cumulative));
    const vat = n(claim.vat_amount);
    const invoiceTotal = base + vat;
    return {
      base,
      vat,
      invoiceTotal,
      net: n(claim.net_payable) || invoiceTotal - n(claim.retention_amount) - n(claim.advance_recovery) - n(claim.other_deductions),
      paid: n(claim.collected_amount),
      rate: n(claim.vat_rate) || n(project?.vat_rate) || 0.15,
    };
  }, [claim, project]);

  if (err) return <div style={{padding:40,direction:'rtl'}}>{err}</div>;
  if (!claim || !cfg) return <div style={{padding:40,direction:'rtl'}}>جارٍ التحميل</div>;

  const title = DOCS[doc] || DOCS.demand;
  const projectName = project?.project_name || '—';
  const clientName = project?.client_name || '—';
  const period = `من ${dateAr(claim.period_from)} إلى ${dateAr(claim.period_to)}`;
  const issueDate = doc === 'receipt' || doc === 'memo'
    ? (claim.collected_at || claim.owner_approved_at || claim.period_to)
    : (doc === 'measure' ? claim.period_to : (claim.submitted_at || claim.period_to));
  const supervisorName = supervisor?.full_name_ar || 'ممثل إدارة المشاريع';
  const financeName = finance?.full_name_ar || 'مسؤول الإدارة المالية';
  const financeTitle = employeeTitle(finance);

  const letter = doc === 'measure'
    ? `بالإشارة إلى الأعمال الجارية في مشروع ${projectName}، نفيدكم بأنه بتاريخ ${dateAr(claim.period_to)} تم النزول الميداني إلى الموقع بواسطة ${supervisorName}، وبحضور ممثليكم ومشرفي الموقع، حيث جرى قياس وحصر الأعمال المنجزة عن الفترة ${period}.\n\nوقد أسفر القياس عن الكميات الموضحة في الجدول أدناه، وتُعد معتمدة ومتفقاً عليها بين الطرفين حال توقيع هذا المحضر.`
    : doc === 'demand'
    ? `بالإشارة إلى الأعمال المنفذة في مشروع ${projectName}، وبناءً على قياس وحصر الأعمال المنجزة خلال الفترة ${period}، نتقدم إليكم بالمطالبة المالية وفق الكميات والقيم الموضحة أدناه.\n\nنأمل التكرم باعتمادها وصرف المستحقات وفق شروط التعاقد.`
    : doc === 'receipt'
    ? `نفيدكم باستلام مبلغ ${money(values.paid || values.net)} ريال عن الأعمال المنفذة والمقاسة حتى تاريخ ${dateAr(claim.period_to)}، من مستخلص بقيمة ${money(values.invoiceTotal)} ريال شامل ضريبة القيمة المضافة وفق الأنظمة المرعية، وقد تم إيداع المبلغ في حساب المؤسسة بموجب تحويل بتاريخ ${dateAr(claim.collected_at)}.\n\nومرفق ما يثبت التحويل، شاكرين لكم حسن تعاونكم، ومتطلعين إلى استمرار العمل المثمر بيننا.`
    : `نفيدكم بسداد السادة / ${clientName} مبلغ ${money(values.paid || values.net)} ريال عن المستخلص رقم (${claim.seq_no || claim.claim_no}) لمشروع ${projectName}، وذلك عن حصر الأعمال المنفذة والمقاسة خلال الفترة ${period}، وفق الكميات والقيم المبينة بالحصر، وبموجب إيصال التحويل المرفق${claim.collect_ref ? ` رقم ${claim.collect_ref}` : ''}${claim.collected_at ? ` بتاريخ ${dateAr(claim.collected_at)}` : ''}.\n\nنأمل التكرم بإصدار الفاتورة الضريبية من نظام الفوترة الخاص بالمنشأة، وإرسالها إلى الأستاذ / ${clientContact || '(مسؤول التواصل لدى الجهة)'}.\n\nهذه المذكرة داخلية ولا تُعد فاتورة ضريبية ولا تقوم مقامها. وفي حال الحاجة إلى أي معلومات إضافية، نرجو عدم التردد في التواصل معنا.`;

  return (
    <>
      <div className="print-toolbar no-print">
        <div className="group">
          {Object.entries(DOCS).map(([k,v])=><button key={k} className={doc===k?'active':''} onClick={()=>setDoc(k)}>{v}</button>)}
        </div>
        <div className="group">
          {doc === 'memo' && !claim.collected_at && <span className="note">لم يتم تسجيل السداد بعد؛ راجع توقيت إصدار المذكرة قبل الطباعة.</span>}
          {doc === 'receipt' && !claim.collected_at && <span className="note">لا يوجد تاريخ سداد مسجل لهذا المستخلص.</span>}
          <button className={showLetterhead?'active':''} onClick={()=>setShowLetterhead((x)=>!x)}>{showLetterhead?'المطبوع ظاهر':'المطبوع مخفي'}</button>
          <button className={showStamp?'active':''} onClick={()=>setShowStamp((x)=>!x)}>{showStamp?'الختم ظاهر':'الختم مخفي'}</button>
          <button className="primary" onClick={()=>window.print()}>طباعة أو حفظ PDF</button>
        </div>
      </div>

      <PrintFrame cfg={cfg} showLetterhead={showLetterhead} showStamp={showStamp}>
        <div className="doc-meta"><span>{claim.claim_no || 'مسودة'}</span><span>{dateAr(issueDate)}</span></div>
        <div className="doc-title"><h1>{title}</h1><span className="rule" /></div>

        {doc !== 'memo' ? (
          <><div className="recipient">السادة / {clientName} المحترمين</div><div className="salutation">السلام عليكم ورحمة الله وبركاته،،</div></>
        ) : (
          <>
            <div className="recipient">سعادة الأستاذ / {financeName}<br />{financeTitle ? `${financeTitle} - الموقر` : 'الموقر'}</div>
            <div className="salutation">السلام عليكم ورحمة الله وبركاته،،</div>
          </>
        )}

        <p className="letter-body">{letter}</p>

        <table className="info-table">
          <tbody>
            <tr><th>المشروع</th><td>{projectName}</td><th>رقم المشروع</th><td>{project?.project_no || '—'}</td></tr>
            <tr><th>الموقع</th><td>{project?.site_address || project?.city || '—'}</td><th>فترة الأعمال</th><td>{period}</td></tr>
            <tr><th>رقم المستخلص</th><td>{claim.claim_no || '—'}</td><th>تاريخ القياس</th><td>{dateAr(claim.period_to)}</td></tr>
          </tbody>
        </table>

        {(doc === 'measure' || doc === 'demand') && (
          <>
            <div className="section-title">الأعمال المنفذة</div>
            <table className="data-table">
              <thead><tr><th style={{width:'9mm'}}>م</th><th>البيان</th><th style={{width:'18mm'}}>الوحدة</th><th className="num" style={{width:'23mm'}}>الكمية</th>{doc==='demand' && <><th className="num" style={{width:'28mm'}}>سعر الوحدة</th><th className="num" style={{width:'30mm'}}>القيمة</th></>}</tr></thead>
              <tbody>
                {rows.map((r,i)=><tr key={r.id || i}><td>{i+1}</td><td>{r.description}</td><td>{r.unit}</td><td className="num">{qty(r.qty_this)}</td>{doc==='demand' && <><td className="num">{money(r.unit_price)}</td><td className="num">{money(r.amount || n(r.qty_this)*n(r.unit_price))}</td></>}</tr>)}
                {!rows.length && <tr><td colSpan={doc==='demand'?6:4}>لا توجد بنود مسجلة في هذا المستخلص.</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {doc !== 'measure' && (
          <>
            <div className="section-title">الملخص المالي</div>
            <table className="summary-table">
              <thead><tr><th>البيان</th><th className="num" style={{width:'35%'}}>المبلغ</th></tr></thead>
              <tbody>
                <tr><td>قيمة الأعمال لهذا المستخلص</td><td className="num">{money(values.base)} <Riyal /></td></tr>
                <tr><td>ضريبة القيمة المضافة {(values.rate*100).toFixed(0)}%</td><td className="num">{money(values.vat)} <Riyal /></td></tr>
                <tr className="total"><td>إجمالي المستخلص شامل الضريبة</td><td className="num">{money(values.invoiceTotal)} <Riyal /></td></tr>
                {n(claim.retention_amount)>0 && <tr><td>المحتجزات</td><td className="num">{money(claim.retention_amount)} <Riyal /></td></tr>}
                {n(claim.advance_recovery)>0 && <tr><td>استرداد الدفعة المقدمة</td><td className="num">{money(claim.advance_recovery)} <Riyal /></td></tr>}
                {n(claim.other_deductions)>0 && <tr><td>خصومات أخرى</td><td className="num">{money(claim.other_deductions)} <Riyal /></td></tr>}
                {(doc==='receipt' || doc==='memo') && <tr><td>المبلغ المسدد</td><td className="num">{money(values.paid || values.net)} <Riyal /></td></tr>}
              </tbody>
            </table>
          </>
        )}

        {doc === 'measure' && <Signatures labels={['ممثل أركان المكان','ممثل الجهة','الاعتماد']} />}
        {doc === 'demand' && <Signatures labels={['إعداد','مراجعة','اعتماد']} />}
        {doc === 'receipt' && <Signatures labels={['إعداد','مراجعة','اعتماد']} />}
        {doc === 'memo' && <Signatures labels={['مقدم الطلب','المراجعة','الاعتماد']} />}
      </PrintFrame>
    </>
  );
}
