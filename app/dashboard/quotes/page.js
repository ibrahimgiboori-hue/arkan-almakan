'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SYSTEM } from '@/lib/system-constitution';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  InlineStatus,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const EN_INTRO = 'We are pleased to submit our quotation for the execution of the works described below, in accordance with the approved drawings, specifications, and project requirements.';
const EN_CLOSING = 'We trust that our quotation meets your requirements and look forward to the opportunity to work with you.';
const EN_TERMS = [
  'Payment terms and schedule shall be agreed upon prior to commencement of the works.',
  'Prices are exclusive of VAT. VAT will be added at the applicable statutory rate.',
].join('\n');

export default function Quotes() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useDashboardSession();
  const [kind, setKind] = useState(searchParams.get('new') === 'boq' ? 'boq' : 'quotation');
  const [language, setLanguage] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const canCreate = canUseCapability(session,'projects.quotes.create','all');

  async function create() {
    if (!canCreate) return;
    setErr(''); setMsg(''); setBusy(true);
    const { data:num, error:numberError } = await supabase.rpc('next_document_number', {
      p_doc_type: kind === 'boq' ? 'BOQ' : 'QUOTE',
      p_prefix: kind === 'boq' ? 'BOQ' : 'QT',
    });
    if (numberError) { setErr('تعذّر توليد الرقم: ' + numberError.message); setBusy(false); return; }

    const { data:cfg } = await supabase.from('app_settings').select('quote_terms_default, vat_rate').eq('id',1).maybeSingle();
    const english = language === 'en';
    const { data, error } = await supabase.from('quotations').insert({
      quote_no:num,
      doc_kind:kind,
      language,
      client_name:english ? 'New Client' : 'عميل جديد',
      client_kind:'entity',
      vat_rate:cfg?.vat_rate ?? SYSTEM.vatRate,
      terms_text:english ? EN_TERMS : (cfg?.quote_terms_default || ''),
      intro_text:english ? EN_INTRO : 'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
      closing_text:english ? EN_CLOSING : 'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
      show_qty:kind === 'boq',
      show_en_desc:english,
    }).select('id').single();
    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    setMsg('تم إنشاء المستند.');
    router.push(`/dashboard/quotes/${data.id}`);
  }

  if (!canCreate) {
    return <ConstitutionPage><EmptyState title="عروض الأسعار" description="لا توجد لديك صلاحية إصدار عرض جديد."/></ConstitutionPage>;
  }

  return <ConstitutionPage>
    <div data-new-quotation-operation="true" data-stage-occupancy="single-action">
      <PageHeader
        eyebrow="QUOTATIONS"
        title="إصدار جديد"
        description="اختر نوع المستند واللغة ثم ابدأ."
      />

      {err ? <Notice tone="error">{err}</Notice> : null}
      {msg ? <InlineStatus tone="success" live>{msg}</InlineStatus> : null}

      <Section title="المستند" description="">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,alignItems:'end',maxWidth:640}}>
          <label style={{display:'grid',gap:6}}>
            <span>النوع</span>
            <select value={kind} onChange={(event)=>setKind(event.target.value)} aria-label="نوع المستند الجديد">
              <option value="quotation">عرض سعر</option>
              <option value="boq">جدول كميات</option>
            </select>
          </label>
          <label style={{display:'grid',gap:6}}>
            <span>اللغة</span>
            <select value={language} onChange={(event)=>setLanguage(event.target.value)} aria-label="لغة المستند الجديد">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <div>
            <button className="btn" disabled={busy} onClick={create}>{busy ? 'جارٍ الإنشاء…' : 'بدء الإصدار'}</button>
          </div>
        </div>
      </Section>
    </div>
  </ConstitutionPage>;
}
