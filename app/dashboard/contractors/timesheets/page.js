'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, TableFrame, EmptyState, Notice, Toolbar } from '@/components/ui/ConstitutionUI';

const monthLabel = (year, month) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month:'long', year:'numeric' }).format(new Date(Number(year), Number(month) - 1, 1));
const statusAr = { draft:'مسودة', reviewed:'مراجع', approved:'معتمد', closed:'مغلق' };

export default function ExternalContractorTimesheets() {
  const router = useRouter();
  const now = new Date();
  const [state, setState] = useState({ loading:true, contractors:[], sheets:[], error:'' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contractor_id:'',
    external_project_name:'',
    site_location:'',
    period:`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`,
    default_daily_rate:'',
  });

  async function load() {
    const [contractorsQ, sheetsQ] = await Promise.all([
      supabase.from('contractors').select('id,name_ar,contractor_no,is_active').order('name_ar'),
      supabase.from('contractor_external_timesheets')
        .select('id,sheet_no,contractor_id,external_project_name,site_location,period_year,period_month,default_daily_rate,status,created_at,contractors(name_ar)')
        .order('period_year',{ascending:false}).order('period_month',{ascending:false}).order('created_at',{ascending:false}),
    ]);
    setState({
      loading:false,
      contractors:(contractorsQ.data || []).filter((row) => row.is_active !== false),
      sheets:sheetsQ.data || [],
      error:contractorsQ.error?.message || sheetsQ.error?.message || '',
    });
  }

  useEffect(() => { load(); }, []);

  async function createSheet(event) {
    event.preventDefault();
    if (!form.contractor_id || !form.external_project_name.trim() || !form.period) return;
    setBusy(true);
    const [yearText, monthText] = form.period.split('-');
    const payload = {
      contractor_id:form.contractor_id,
      external_project_name:form.external_project_name.trim(),
      site_location:form.site_location.trim() || null,
      period_year:Number(yearText),
      period_month:Number(monthText),
      default_daily_rate:form.default_daily_rate === '' ? null : Number(form.default_daily_rate),
    };
    const { data, error } = await supabase.from('contractor_external_timesheets').insert(payload).select('id').single();
    setBusy(false);
    if (error) {
      setState((current) => ({ ...current, error:error.message }));
      return;
    }
    router.push(`/dashboard/contractors/timesheets/${data.id}`);
  }

  if (state.loading) return <ConstitutionPage><EmptyState title="جارٍ تحميل تايم شيتات المقاولين" /></ConstitutionPage>;

  return <ConstitutionPage>
    <PageHeader
      eyebrow="EXTERNAL TIMESHEETS"
      title="تايم شيت مقاول خارجي"
      description="خدمة مستقلة للمقاول لا تنشئ مشروعًا داخل أركان المكان ولا تدخل تلقائيًا في حسابات المشاريع الداخلية."
      actions={<Toolbar><Link className="btn ghost" href="/dashboard/contractors">المقاولون</Link><button className="btn" type="button" onClick={() => setOpen((value) => !value)}>{open ? 'إغلاق' : 'تايم شيت جديد'}</button></Toolbar>}
    />

    {state.error ? <Notice tone="warning">{state.error}</Notice> : null}

    {open ? <Section title="إنشاء تايم شيت شهري" description="يمكن أن يكون المقاول مسجلًا عندك بدون أي ارتباط بمشروع داخلي.">
      <form onSubmit={createSheet} className="form-grid" style={{padding:16}}>
        <div className="field span2"><label>المقاول *</label><select required value={form.contractor_id} onChange={(e) => setForm({...form,contractor_id:e.target.value})}><option value="">اختر المقاول</option>{state.contractors.map((row) => <option key={row.id} value={row.id}>{row.name_ar}</option>)}</select><div className="hint">إذا لم يكن موجودًا، أضفه أولًا من سجل المقاولين دون ربطه بأي مشروع.</div></div>
        <div className="field span2"><label>اسم المشروع الخارجي *</label><input required value={form.external_project_name} onChange={(e) => setForm({...form,external_project_name:e.target.value})} placeholder="مثال: مشروع الخرج" /></div>
        <div className="field"><label>الموقع</label><input value={form.site_location} onChange={(e) => setForm({...form,site_location:e.target.value})} placeholder="الخرج" /></div>
        <div className="field"><label>الشهر *</label><input type="month" required value={form.period} onChange={(e) => setForm({...form,period:e.target.value})} /></div>
        <div className="field"><label>اليومية الافتراضية</label><input type="number" min="0" step="0.01" dir="ltr" value={form.default_daily_rate} onChange={(e) => setForm({...form,default_daily_rate:e.target.value})} placeholder="تترك فارغة الآن" /></div>
        <div className="field" style={{alignSelf:'end'}}><button className="btn" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء وفتح'}</button></div>
      </form>
    </Section> : null}

    <Section title="السجل" description={`${state.sheets.length} تايم شيت`}>
      {!state.sheets.length ? <EmptyState title="لا يوجد تايم شيت خارجي بعد" description="أنشئ أول تايم شيت، ثم أضف العمال وعدد أيامهم وزرع الأيام تلقائيًا." /> : <TableFrame><table>
        <thead><tr><th>رقم</th><th>المقاول</th><th>المشروع الخارجي</th><th>الشهر</th><th>الحالة</th><th>اليومية</th><th>الإجراء</th></tr></thead>
        <tbody>{state.sheets.map((sheet) => <tr key={sheet.id}>
          <td>{sheet.sheet_no || '—'}</td>
          <td>{sheet.contractors?.name_ar || '—'}</td>
          <td><strong>{sheet.external_project_name}</strong>{sheet.site_location ? <div className="hint">{sheet.site_location}</div> : null}</td>
          <td>{monthLabel(sheet.period_year,sheet.period_month)}</td>
          <td>{statusAr[sheet.status] || sheet.status}</td>
          <td>{sheet.default_daily_rate == null ? 'غير محددة' : `${Number(sheet.default_daily_rate).toLocaleString('ar-SA')} ر.س`}</td>
          <td><Link className="btn ghost" href={`/dashboard/contractors/timesheets/${sheet.id}`}>فتح</Link></td>
        </tr>)}</tbody>
      </table></TableFrame>}
    </Section>
  </ConstitutionPage>;
}
