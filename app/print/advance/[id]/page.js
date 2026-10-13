'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { statusLabelAr } from '@/lib/system-constitution';
import { PRINT_FLOW_KIND } from '@/lib/print-governance';
import { advanceInstallmentAmount, buildAdvanceProcedureSlots } from '@/lib/advance-request.mjs';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import ProcedureStagePanel from '@/components/print/ProcedureStagePanel';
import Riyal from '@/components/Riyal';

const valueOrDash = (value) => value == null || value === '' ? '—' : value;

function MoneyValue({ value }) {
  return value == null ? '—' : <>{money(value)} <Riyal/></>;
}

export default function AdvancePrint() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setRow(null); setCfg(null); setError('');

    (async () => {
      try {
        const [request, settings, procedures, schedule] = await Promise.all([
          supabase.from('advances')
            .select('*, employees(full_name_ar, employee_no, job_title, department)')
            .eq('id', id).maybeSingle(),
          supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('v_approval_register').select('*')
            .eq('entity_table', 'advances').eq('entity_id', id).order('step_order'),
          supabase.from('advance_installments').select('*').eq('advance_id', id).order('due_month'),
        ]);
        if (cancelled) return;
        if (request.error || !request.data) {
          setError('لم يُعثر على طلب السلفة، أو لا تملك صلاحية عرضه.');
          return;
        }
        if (settings.error || procedures.error || schedule.error) {
          setError('تعذر تحميل بيانات طباعة السلفة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
          return;
        }
        setRow(request.data);
        setCfg(settings.data || {});
        setApprovals(procedures.data || []);
        setInstallments(schedule.data || []);
      } catch {
        if (!cancelled) setError('تعذر تحميل طلب السلفة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div role="alert" dir="rtl" style={{padding:40}}>
    <p>{error}</p><Link href="/dashboard/advances">العودة إلى السلف والمديونيات</Link>
  </div>;
  if (!row || !cfg) return <div dir="rtl" style={{padding:40}}>جارٍ تجهيز طلب السلفة…</div>;

  const employee = row.employees || {};
  const procedures = buildAdvanceProcedureSlots(approvals, employee.full_name_ar || '');
  const hasFinanceReview = row.finance_approved_amount != null || row.finance_installments != null
    || row.finance_first_deduction_month != null || Boolean(row.finance_note);

  return <>
    <div className="print-toolbar no-print">
      <button type="button" className="primary" onClick={() => window.print()}>طباعة أو حفظ PDF</button>
      <Link href="/dashboard/advances">السلف والمديونيات</Link>
      <span className="note">طلب سلفة — {employee.full_name_ar}</span>
    </div>

    <ConstitutionPrintFrame documentKey="advance_request" cfg={cfg} direction="rtl">
      <div className="xlsx-doc">
        <div className="xlsx-meta" data-print-keep-with-next="true">
          <span>{cfg.company_name_ar}</span><span>{dateAr(row.created_at)}</span>
        </div>
        <div className="xlsx-title" data-print-keep-with-next="true">
          <h1>طلب سلفة</h1><span className="rule"/>
        </div>

        <div className="xlsx-grid">
          <div className="xlsx-cell xlsx-label s2">الموظف</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(employee.full_name_ar)}</div>
          <div className="xlsx-cell xlsx-label s2">الرقم الوظيفي</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(employee.employee_no)}</div>
          <div className="xlsx-cell xlsx-label s2">المسمى الوظيفي</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(employee.job_title)}</div>
          <div className="xlsx-cell xlsx-label s2">الإدارة</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(employee.department)}</div>
          <div className="xlsx-cell xlsx-label s2">رقم الطلب</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(row.request_no)}</div>
          <div className="xlsx-cell xlsx-label s2">تاريخ الطلب</div>
          <div className="xlsx-cell xlsx-value s4">{dateAr(row.created_at)}</div>
          <div className="xlsx-cell xlsx-label s2">حالة الطلب</div>
          <div className="xlsx-cell xlsx-value s4">{statusLabelAr(row.status)}</div>
          <div className="xlsx-cell xlsx-label s2">حالة الصرف</div>
          <div className="xlsx-cell xlsx-value s4">{row.disbursed_at ? `صُرفت بتاريخ ${dateAr(row.disbursed_at)}` : 'لم تُصرف'}</div>
        </div>

        <div className="xlsx-grid">
          <div className="xlsx-cell xlsx-section s12">بيانات السلفة المطلوبة</div>
          <div className="xlsx-cell xlsx-label s2">المبلغ المطلوب</div>
          <div className="xlsx-cell xlsx-value num s4"><MoneyValue value={row.amount}/></div>
          <div className="xlsx-cell xlsx-label s2">عدد الأقساط</div>
          <div className="xlsx-cell xlsx-value num s4">{valueOrDash(row.installments)}</div>
          <div className="xlsx-cell xlsx-label s2">القسط المتوقع</div>
          <div className="xlsx-cell xlsx-value num s4"><MoneyValue value={advanceInstallmentAmount(row.amount, row.installments)}/></div>
          <div className="xlsx-cell xlsx-label s2">بداية الخصم</div>
          <div className="xlsx-cell xlsx-value s4">{dateAr(row.first_deduction_month)}</div>
          <div className="xlsx-cell xlsx-label s2">سبب طلب السلفة</div>
          <div className="xlsx-cell xlsx-value print-prose s10">{valueOrDash(row.reason)}</div>
        </div>

        {hasFinanceReview && <div className="xlsx-grid">
          <div className="xlsx-cell xlsx-section s12">نتيجة المراجعة المالية</div>
          <div className="xlsx-cell xlsx-label s2">المبلغ الموافق عليه</div>
          <div className="xlsx-cell xlsx-value num s4"><MoneyValue value={row.finance_approved_amount}/></div>
          <div className="xlsx-cell xlsx-label s2">عدد الأقساط</div>
          <div className="xlsx-cell xlsx-value num s4">{valueOrDash(row.finance_installments)}</div>
          <div className="xlsx-cell xlsx-label s2">بداية الخصم</div>
          <div className="xlsx-cell xlsx-value s4">{dateAr(row.finance_first_deduction_month)}</div>
          <div className="xlsx-cell xlsx-label s2">تاريخ المراجعة</div>
          <div className="xlsx-cell xlsx-value s4">{dateAr(row.finance_reviewed_at)}</div>
          {row.finance_note && <>
            <div className="xlsx-cell xlsx-label s2">ملاحظات المالية</div>
            <div className="xlsx-cell xlsx-value print-prose s10">{row.finance_note}</div>
          </>}
        </div>}

        {row.disbursed_at && <div className="xlsx-grid">
          <div className="xlsx-cell xlsx-label s2">تاريخ الصرف</div>
          <div className="xlsx-cell xlsx-value s4">{dateAr(row.disbursed_at)}</div>
          <div className="xlsx-cell xlsx-label s2">مرجع الصرف</div>
          <div className="xlsx-cell xlsx-value s4">{valueOrDash(row.disbursement_reference)}</div>
        </div>}

        {installments.length > 0 && <>
          <div className="section-title" data-print-keep-with-next="true">جدول الأقساط المسجل</div>
          <table className="data-table" data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}>
            <thead><tr><th data-print-column-role="row-index">م</th><th>شهر الخصم</th><th className="num">مبلغ القسط</th><th>حالة الخصم</th><th>تاريخ الخصم</th></tr></thead>
            <tbody>{installments.map((item, index) => <tr key={item.id}>
              <td>{index + 1}</td><td>{dateAr(item.due_month)}</td>
              <td className="num"><MoneyValue value={item.amount}/></td>
              <td>{item.is_deducted ? 'تم الخصم' : 'قائم'}</td>
              <td>{item.is_deducted ? dateAr(item.deducted_at) : '—'}</td>
            </tr>)}</tbody>
          </table>
        </>}

        <ProcedureStagePanel electronic={procedures.electronic} manual={procedures.manual}/>
      </div>
    </ConstitutionPrintFrame>
  </>;
}
