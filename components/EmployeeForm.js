'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import OrgRoleFields from '@/components/OrgRoleFields';

const EMPTY = {
  employee_no:'', full_name_ar:'', full_name_en:'', nationality:'',
  id_kind:'iqama', id_number:'', id_expiry:'', mobile:'', email:'',
  job_title:'', department:'', hire_date:'', status:'active', annual_leave_days:21,
  org_classification_id:'', org_position_id:'', org_job_title_id:'',
  basic_salary:0, housing_allowance:0, transport_allowance:0, other_allowance:0,
  iban:'', bank_name:'', gosi_number:'', commission_rate:0, duties:'', notes:'',
};

export default function EmployeeForm({ initial, id }) {
  const router = useRouter();
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setOrg = (patch) => setF((current) => ({ ...current, ...patch }));
  const gross = ['basic_salary','housing_allowance','transport_allowance','other_allowance']
    .reduce((t,k) => t + Number(f[k]||0), 0);

  async function save(e) {
    e.preventDefault();
    setErr(''); setOk(''); setBusy(true);
    const payload = { ...f };
    ['id_expiry','hire_date'].forEach((k) => { if (!payload[k]) payload[k] = null; });
    ['org_classification_id','org_position_id','org_job_title_id'].forEach((k) => { if (!payload[k]) payload[k] = null; });
    ['basic_salary','housing_allowance','transport_allowance','other_allowance','commission_rate','annual_leave_days']
      .forEach((k) => { payload[k] = Number(payload[k] || 0); });
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    const res = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert(payload);
    setBusy(false);

    if (res.error) {
      const m = res.error.message || '';
      if (m.includes('employees_employee_no_key')) setErr('الرقم الوظيفي مستخدم لموظف آخر. اختر رقماً غيره.');
      else if (m.includes('row-level security')) setErr('تعذر حفظ بيانات الموظف بسبب سياسة الوصول الحالية.');
      else setErr('تعذر الحفظ: ' + m);
      return;
    }
    setOk('تم الحفظ');
    router.push('/dashboard/employees');
  }

  return (
    <form onSubmit={save}>
      {err && <div className="msg err" style={{marginBottom:16}}>{err}</div>}
      {ok && <div className="msg ok" style={{marginBottom:16}}>{ok}</div>}
      <div className="section" style={{marginTop:0}}><div style={{padding:'18px 18px 4px'}}>
        <fieldset style={{borderTop:'none',paddingTop:0}}>
          <legend>البيانات الأساسية</legend>
          <div className="form-grid">
            <div className="field"><label>الرقم الوظيفي *</label><input required value={f.employee_no} onChange={set('employee_no')} placeholder="EMP-008" dir="ltr" /></div>
            <div className="field span2"><label>الاسم الكامل بالعربية *</label><input required value={f.full_name_ar} onChange={set('full_name_ar')} /></div>
            <div className="field span2"><label>الاسم بالإنجليزية</label><input value={f.full_name_en || ''} onChange={set('full_name_en')} dir="ltr" /></div>
            <div className="field"><label>الجنسية</label><input value={f.nationality || ''} onChange={set('nationality')} /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>الهوية والتواصل</legend>
          <div className="form-grid">
            <div className="field"><label>نوع الهوية</label><select value={f.id_kind || 'iqama'} onChange={set('id_kind')}><option value="national_id">هوية وطنية</option><option value="iqama">إقامة</option></select></div>
            <div className="field"><label>رقم الهوية / الإقامة</label><input value={f.id_number || ''} onChange={set('id_number')} dir="ltr" /></div>
            <div className="field"><label>تاريخ الانتهاء</label><input type="date" value={f.id_expiry || ''} onChange={set('id_expiry')} dir="ltr" /><span className="hint">ينبهك النظام قبل الانتهاء بـ90 يوماً</span></div>
            <div className="field"><label>رقم الجوال</label><input value={f.mobile || ''} onChange={set('mobile')} dir="ltr" placeholder="05xxxxxxxx" /></div>
            <div className="field span2"><label>البريد الإلكتروني</label><input type="email" value={f.email || ''} onChange={set('email')} dir="ltr" /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>الهيكل الوظيفي والاستحقاقات</legend>
          <div className="form-grid">
            <OrgRoleFields value={f} onChange={setOrg} />
            <div className="field"><label>تاريخ المباشرة</label><input type="date" value={f.hire_date || ''} onChange={set('hire_date')} dir="ltr" /><span className="hint">يبدأ منه احتساب رصيد الإجازة السنوية.</span></div>
            <div className="field"><label>الإجازة السنوية المتفق عليها</label><input type="number" min="1" step="1" value={f.annual_leave_days ?? 21} onChange={set('annual_leave_days')} dir="ltr" /><span className="hint">تستحق تدريجياً خلال 365 يوماً ولا تمنح كاملة من أول يوم.</span></div>
            <div className="field"><label>الحالة</label><select value={f.status} onChange={set('status')}><option value="active">على رأس العمل</option><option value="on_leave">في إجازة</option><option value="suspended">موقوف</option><option value="terminated">منتهي</option></select></div>
            <div className="field span2"><label>المهام الوظيفية</label><textarea rows="3" value={f.duties || ''} onChange={set('duties')} placeholder="اكتب المهام الفعلية باختصار" /><span className="hint">المهام لا تحدد صلاحية استخدام البرنامج.</span></div>
            <div className="field"><label>نسبة العمولة</label><input type="number" step="0.001" min="0" max="1" value={f.commission_rate} onChange={set('commission_rate')} dir="ltr" /><span className="hint">0.025 تعني 2.5% من ربح المشاريع التي يجلبها</span></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>الراتب والبدلات</legend>
          <div className="form-grid">
            <div className="field"><label>الراتب الأساسي</label><input type="number" min="0" step="0.01" value={f.basic_salary} onChange={set('basic_salary')} dir="ltr" /></div>
            <div className="field"><label>بدل السكن</label><input type="number" min="0" step="0.01" value={f.housing_allowance} onChange={set('housing_allowance')} dir="ltr" /></div>
            <div className="field"><label>بدل النقل</label><input type="number" min="0" step="0.01" value={f.transport_allowance} onChange={set('transport_allowance')} dir="ltr" /></div>
            <div className="field"><label>بدلات أخرى</label><input type="number" min="0" step="0.01" value={f.other_allowance} onChange={set('other_allowance')} dir="ltr" /></div>
            <div className="field span2"><label>الراتب الإجمالي</label><input value={gross.toFixed(2)} readOnly dir="ltr" style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}} /><span className="hint">محسوب تلقائياً - لا يدخل يدوياً</span></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>البيانات البنكية والتأمينية</legend>
          <div className="form-grid">
            <div className="field span2"><label>رقم الآيبان</label><input value={f.iban || ''} onChange={set('iban')} dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" /></div>
            <div className="field"><label>اسم البنك</label><input value={f.bank_name || ''} onChange={set('bank_name')} /></div>
            <div className="field"><label>رقم التأمينات</label><input value={f.gosi_number || ''} onChange={set('gosi_number')} dir="ltr" /></div>
            <div className="field span2"><label>ملاحظات</label><textarea rows="2" value={f.notes || ''} onChange={set('notes')} /></div>
          </div>
        </fieldset>
      </div></div>

      <div className="rowsplit" style={{marginTop:18}}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ' : (id ? 'حفظ التعديلات' : 'إضافة الموظف')}</button>
        <button className="btn ghost" type="button" onClick={()=>router.back()}>إلغاء</button>
      </div>
    </form>
  );
}
