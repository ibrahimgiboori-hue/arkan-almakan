'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { monthKey, monthLabelAr } from '@/lib/operating-budget';
import { operationalDate } from '@/lib/system-constitution';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  SummaryStrip,
  TableFrame,
  Notice,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amount(value) {
  return `${money(value)} ريال`;
}

function varianceLabel(value) {
  const n = num(value);
  if (n > 0) return `أعلى من الخطة بـ ${amount(Math.abs(n))}`;
  if (n < 0) return `أقل من الخطة بـ ${amount(Math.abs(n))}`;
  return 'مطابق للخطة';
}

function outstandingChangeLabel(value) {
  const n = num(value);
  if (n > 0) return `زاد المتراكم ${amount(n)}`;
  if (n < 0) return `انخفض المتراكم ${amount(Math.abs(n))}`;
  return 'المتراكم لم يتغير';
}

export default function OperatingBudgetAnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => searchParams.get('month') || monthKey(operationalDate()));
  const [period, setPeriod] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data: periods, error: periodsError } = await supabase
        .from('budget_periods')
        .select('id,period_start,period_end,status')
        .order('period_start', { ascending: false });
      if (periodsError) throw periodsError;
      const row = (periods || []).find((item) => monthKey(item.period_start) === month) || null;
      setPeriod(row);
      if (!row) {
        setIntelligence(null);
        return;
      }
      const { data, error } = await supabase.rpc('budget_period_intelligence_v1', { p_period_id: row.id });
      if (error) throw error;
      setIntelligence(data || null);
    } catch (e) {
      setErr(e?.message || 'تعذر تحميل قراءة الميزانية.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [month]);

  function changeMonth(next) {
    setMonth(next);
    router.replace(`/dashboard/operating-budget/analysis?month=${encodeURIComponent(next)}`);
  }

  const summary = intelligence?.summary || {};
  const varianceDrivers = useMemo(() => intelligence?.cash_variance_drivers || [], [intelligence]);
  const outstandingDrivers = useMemo(() => intelligence?.outstanding_drivers || [], [intelligence]);
  const actual = num(summary.actual_paid_this_period);
  const planned = num(summary.planned_due_this_period);
  const variance = num(summary.cash_variance);
  const openingOutstanding = num(summary.opening_outstanding);
  const closingOutstanding = num(summary.closing_outstanding);
  const outstandingChange = num(summary.outstanding_change);
  const asOf = summary.as_of;

  if (loading) return <ConstitutionPage><EmptyState title="جارٍ تحليل ميزانية التشغيل" description="يتم قراءة الخطة، السداد الفعلي والمتراكمات من نفس الحقيقة المالية." /></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="المالية · ميزانية التشغيل"
      title="قراءة الشهر"
      description="تحليل مشتق من الخطة وحركات الخزينة والاستحقاقات المفتوحة. لا ينشئ هذا التقرير أي حركة مالية ولا يغيّر الحقيقة."
      actions={<input type="month" dir="ltr" value={month} onChange={(e) => changeMonth(e.target.value)} />}
    />

    {err && <Notice tone="error">{err}</Notice>}

    {!period ? <EmptyState title={`لا توجد ميزانية مفتوحة لـ ${monthLabelAr(month)}`} description="افتح الشهر من تشغيل الميزانية أولًا ليولد النظام دورات الاستحقاق والتحليل." /> : !intelligence ? <EmptyState title="لا توجد قراءة متاحة" /> : <>
      <Section title={`ملخص ${monthLabelAr(month)}`} description={asOf ? `الحركة الفعلية محسوبة حتى ${dateAr(asOf)}` : null}>
        <SummaryStrip items={[
          { key:'planned', label:'خطة استحقاقات الشهر', value:money(planned), note:'ريال' },
          { key:'actual', label:'المدفوع فعليًا', value:money(actual), note:asOf ? `حتى ${dateAr(asOf)}` : 'ريال' },
          { key:'variance', label:'فرق الصرف عن الخطة', value:money(variance), note:varianceLabel(variance) },
          { key:'opening-outstanding', label:'متراكم بداية الشهر', value:money(openingOutstanding), note:'ريال' },
          { key:'closing-outstanding', label:'المتراكم الحالي', value:money(closingOutstanding), note:`${num(summary.outstanding_obligation_count)} استحقاق مفتوح` },
          { key:'outstanding-change', label:'تغير المتراكم', value:money(outstandingChange), note:outstandingChangeLabel(outstandingChange) },
        ]} />
      </Section>

      <Section title="ماذا حدث هذا الشهر؟">
        <div style={{ padding:'14px 2px', lineHeight:1.9 }}>
          <strong>{actual === planned ? 'الصرف الفعلي مطابق لخطة الاستحقاقات.' : actual > planned ? `الصرف الفعلي أعلى من خطة الشهر بمقدار ${amount(actual-planned)}.` : `الصرف الفعلي أقل من خطة الشهر بمقدار ${amount(planned-actual)}.`}</strong>
          <div className="muted" style={{ marginTop:4 }}>
            {closingOutstanding === openingOutstanding
              ? `الرصيد غير المسدد بقي عند ${amount(closingOutstanding)}.`
              : closingOutstanding > openingOutstanding
                ? `وفي الوقت نفسه ارتفع الرصيد غير المسدد من ${amount(openingOutstanding)} إلى ${amount(closingOutstanding)}؛ لذلك انخفاض الصرف لا يعني بالضرورة وفرًا نقديًا.`
                : `وانخفض الرصيد غير المسدد من ${amount(openingOutstanding)} إلى ${amount(closingOutstanding)}، ما يعني أن جزءًا من الصرف عالج التزامات متراكمة.`}
          </div>
        </div>
      </Section>

      <Section title="أكبر البنود المؤثرة على فرق الصرف" description="الفرق = المدفوع فعليًا خلال الشهر − الاستحقاقات المخططة للشهر. يظهر الأكبر تأثيرًا أولًا.">
        {varianceDrivers.length ? <TableFrame><table><thead><tr><th>البند</th><th>خطة الشهر</th><th>مدفوع فعليًا</th><th>الفرق</th><th>القراءة</th></tr></thead><tbody>
          {varianceDrivers.map((item) => <tr key={item.item_id}>
            <td><strong>{item.item_name}</strong></td>
            <td>{amount(item.planned_due_this_period)}</td>
            <td>{amount(item.actual_paid_this_period)}</td>
            <td><strong>{amount(item.cash_variance)}</strong></td>
            <td>{varianceLabel(item.cash_variance)}</td>
          </tr>)}
        </tbody></table></TableFrame> : <EmptyState title="لا يوجد فرق مؤثر حتى الآن" description="سيظهر هنا الفرق بمجرد وجود استحقاقات أو سداد فعلي في الشهر." />}
      </Section>

      <Section title="أكبر المتراكمات المفتوحة" description="كل التزامات البند التي حل موعدها ولم يثبت سدادها من الخزينة، مجمعة عبر الزمن.">
        {outstandingDrivers.length ? <TableFrame><table><thead><tr><th>البند</th><th>المتراكم</th><th>عدد الاستحقاقات</th><th>أقدم استحقاق</th></tr></thead><tbody>
          {outstandingDrivers.map((item) => <tr key={item.item_id}>
            <td><strong>{item.item_name}</strong></td>
            <td><strong>{amount(item.closing_outstanding)}</strong></td>
            <td>{num(item.outstanding_count)}</td>
            <td>{item.oldest_unpaid_due ? dateAr(item.oldest_unpaid_due) : '—'}</td>
          </tr>)}
        </tbody></table></TableFrame> : <EmptyState title="لا توجد متراكمات مستحقة" description="لا توجد التزامات حل موعدها وما زالت بلا سداد مثبت." />}
      </Section>
    </>}
  </ConstitutionPage>;
}
