'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, TableFrame, EmptyState, Notice, Toolbar } from '@/components/ui/ConstitutionUI';

export default function ContractorLaborRoute() {
  const { id } = useParams();
  const [state, setState] = useState({ loading:true, contractor:null, projects:[], error:'' });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [contractorQ, projectsQ] = await Promise.all([
        supabase.from('contractors').select('id,name_ar,contractor_no').eq('id', id).maybeSingle(),
        supabase
          .from('project_contractors')
          .select('project_id,is_active,start_date,end_date,projects(id,project_no,name_ar,status)')
          .eq('contractor_id', id)
          .order('start_date', { ascending:false }),
      ]);
      if (!alive) return;
      const error = contractorQ.error || projectsQ.error;
      setState({
        loading:false,
        contractor:contractorQ.data || null,
        projects:projectsQ.data || [],
        error:error?.message || '',
      });
    })();
    return () => { alive = false; };
  }, [id]);

  if (state.loading) return <ConstitutionPage><EmptyState title="جارٍ تحديد مشاريع المقاول" /></ConstitutionPage>;
  if (!state.contractor) return <ConstitutionPage><Notice tone="warning">{state.error || 'لم يُعثر على المقاول.'}</Notice></ConstitutionPage>;

  return <ConstitutionPage data-retired-labor-entry="contractor-level">
    <PageHeader
      eyebrow="LABOR"
      title={`عمالة ${state.contractor.name_ar}`}
      description="إضافة العمالة وإسنادها وتعديل إسنادها التشغيلي تتم من شاشة عمالة المشروع فقط؛ حتى لا توجد طريقتان لإنشاء العامل أو ربطه بالمشروع."
      actions={<Toolbar><Link className="btn ghost" href={`/dashboard/contractors/${id}`}>بيانات المقاول</Link><Link className="btn ghost" href="/dashboard/projects">المشاريع</Link></Toolbar>}
    />

    {state.error && <Notice tone="warning">تعذر تحميل بعض روابط المشاريع: {state.error}</Notice>}

    <Section title="اختر المشروع" description="هذا المسار لا ينشئ ولا يعدّل العمالة. ينتقل بك إلى المصدر التشغيلي الوحيد للعمالة داخل المشروع.">
      {!state.projects.length ? <EmptyState title="لا توجد مشاريع مرتبطة بهذا المقاول" description="اربط المقاول بالمشروع أولًا، ثم أضف العمالة من شاشة عمالة المشروع." /> : <TableFrame><table>
        <thead><tr><th>المشروع</th><th>حالة الربط</th><th>الفترة</th><th>الإجراء</th></tr></thead>
        <tbody>{state.projects.map((link) => <tr key={`${link.project_id}-${link.start_date || ''}`}>
          <td><strong>{link.projects?.project_no || '—'}</strong><div className="hint">{link.projects?.name_ar || '—'}</div></td>
          <td>{link.is_active ? 'نشط' : 'منتهٍ'}</td>
          <td>{link.start_date || '—'} — {link.end_date || 'مفتوح'}</td>
          <td>{link.projects?.id ? <Link className="btn" href={`/dashboard/projects/${link.projects.id}/operations/labor`}>فتح عمالة المشروع</Link> : '—'}</td>
        </tr>)}</tbody>
      </table></TableFrame>}
    </Section>
  </ConstitutionPage>;
}