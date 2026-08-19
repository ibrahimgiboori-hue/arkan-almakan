'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import OrgRoleFields from '@/components/OrgRoleFields';

const EMPTY = {
  employee_no:'', employment_kind:'regular', replaces_employee_id:'', replacement_leave_request_id:'',
  planned_start_date:'', planned_end_date:'',
  full_name_ar:'', full_name_en:'', nationality:'',
  id_kind:'iqama', id_number:'', id_expiry:'', mobile:'', email:'',
  job_title:'', department:'', hire_date:'', status:'active', annual_leave_days:21,
  org_classification_id:'', org_position_id:'', org_job_title_id:'',
  basic_salary:0, housing_allowance:0, transport_allowance:0, other_allowance:0,
  iban:'', bank_name:'', gosi_number:'', commission_rate:0, duties:'', notes:'',
};

export default function EmployeeForm({ initial, id }) {
  const router = useRouter();
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [numberPreview, setNumberPreview] = useState(initial?.employee_no || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const isTemporary = f.employment_kind === 'temporary_replacement';
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const setOrg = (patch) => setF((current) => ({ ...current, ...patch }));
  const gross = ['basic_salary','housing_allowance','transport_allowance','other_allowance']
    .reduce((t,k) => t + Number(f[k]||0), 0);

  useEffect(() => {
    if (id) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('employees')
        .select('id,employee_no,full_name_ar,status,job_title,department,duties,basic_salary,housing_allowance,transport_allowance,other_allowance,commission_rate,org_classification_id,org_position_id,org_job_title_id,direct_manager_id')
        .neq('status','terminated').order('employee_no');
      if (!alive) return;
      if (error) setErr(error.message); else setEmployees(data || []);
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!isTemporary || !f.replaces_employee_id) { setLeaveRequests([]); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('leave_requests')
        .select('id,start_date,end_date,status,leave_kind,reason')
        .eq('employee_id',f.replaces_employee_id)
        .in('status',['submitted','hr_reviewed','ceo_approved'])
        .order('start_date',{ascending:false});
      if (!alive) return;
      if (error) setErr(error.message); else setLeaveRequests(data || []);
    })();
    return () => { alive = false; };
  }, [isTemporary, f.replaces_employee_id]);

  useEffect(() => {
    if (id) { setNumberPreview(f.employee_no || ''); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc('next_employee_no', {
        p_classification_id: f.org_classification_id || null,
        p_person_kind: 'employee',
        p_employment_kind: f.employment_kind || 'regular',
      });
      if (alive && data) setNumberPreview(data);
    })();
    return () => { alive = false; };
  }, [id, f.org_classification_id, f.employment_kind]);

  function chooseEmploymentKind(kind) {
    if (id) return;
    if (kind === 'regular') {
      setF((cur) => ({ ...cur, employment_kind:'regular', replaces_employee_id:'', replacement_leave_request_id:'', planned_start_date:'', planned_end_date:'', status:'active' }));
    } else {
      setF((cur) => ({ ...cur, employment_kind:'temporary_replacement', hire_date:'', status:'pending_start' }));
    }
  }

  function chooseReplacedEmployee(employeeId) {
    const base = employees.find((e) => e.id === employeeId);
    setF((cur) => ({
      ...cur,
      replaces_employee_id: employeeId,
      replacement_leave_request_id:'', planned_start_date:'', planned_end_date:'',
      org_classification_id: base?.org_classification_id || '',
      org_position_id: base?.org_position_id || '',
      org_job_title_id: base?.org_job_title_id || '',
      job_title: base?.job_title || '', department: base?.department || '', duties: base?.duties || '',
      basic_salary:Number(base?.basic_salary || 0), housing_allowance:Number(base?.housing_allowance || 0),
      transport_allowance:Number(base?.transport_allowance || 0), other_allowance:Number(base?.other_allowance || 0),
      commission_rate:Number(base?.commission_rate || 0), status:'pending_start', hire_date:'',
    }));
  }

  function chooseLeaveRequest(requestId) {
    const req = leaveRequests.find((r) => r.id === requestId);
    setF((cur) => ({
      ...cur,
      replacement_leave_request_id: requestId,
      planned_start_date: req?.start_date || '',
      planned_end_date: req?.end_date || '',
    }));
  }

  async function save(e) {
    e.preventDefault();
    setErr(''); setOk('');
    if (isTemporary && !f.replaces_employee_id) { setErr('حدد الموظف الذي سيحل البديل محله.'); return; }
    if (isTemporary && !f.replacement_leave_request_id) { setErr('حدد طلب الإجازة المرتبط بالبديل.'); return; }

    setBusy(true);
    const payload = { ...f };
    ['id_expiry','hire_date','planned_start_date','planned_end_date'].forEach((k) => { if (!payload[k]) payload[k] = null; });
    ['org_classification_id','org_position_id','org_job_title_id','replaces_employee_id','replacement_leave_request_id'].forEach((k) => { if (!payload[k]) payload[k] = null; });
    ['basic_salary','housing_allowance','transport_allowance','other_allowance','commission_rate','annual_leave_days']
      .forEach((k) => { payload[k] = Number(payload[k] || 0); });
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    if (!id) delete payload.employee_no; // القاعدة تولد الرقم داخل نفس عملية الحفظ لمنع التكرار.
    if (isTemporary) {
      payload.hire_date = null;
      payload.status = 'pending_start';
    } else {
      payload.replaces_employee_id = null;
      payload.replacement_leave_request_id = null;
      payload.planned_start_date = null;
      payload.planned_end_date = null;
    }

    const res = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert(payload);
    setBusy(false);

    if (res.error) {
      const m = res.error.message || '';
      if (m.includes('employees_employee_no_key')) setErr('تعذر توليد رقم وظيفي فريد. أعد المحاولة.');
      else if (m.includes('row-level security')) setErr('تعذر حفظ بيانات الموظف بسبب سياسة الوصول الحالية.');
      else setErr('تعذر الحفظ: ' + m);
      return;
    }
    setOk('تم الحفظ');
    router.push('/dashboard/employees');
  }

  const selectedReplaced = useMemo(() => employees.find((e)=>e.id===f.replaces_employee_id), [employees,f.replaces_employee_id]);

  return (
    <form onSubmit={save}>
      {err && <div className="msg err" style={{marginBottom:16}}>{err}</div>}
      {ok && <div className="msg ok" style={{marginBottom:16}}>{ok}</div>}
      <div className="section" style={{marginTop:0}}><div style={{padding:'18px 18px 4px'}}>
        <fieldset style={{borderTop:'none',paddingTop:0}}>
          <legend>البيانات الأساسية</legend>
          <div className="form-grid">
            {!id && <div className="field span2"><label>نوع الإضافة *</label><select value={f.employment_kind} onChange={(e)=>chooseEmploymentKind(e.target.value)}><option value="regular">موظف</option><option value="temporary_replacement">موظف بديل مؤقت</option></select></div>}
            <div className="field"><label>الرقم الوظيفي</label><input value={id ? f.employee_no : (numberPreview || 'يولد تلقائيًا')} readOnly dir="ltr" /><span className="hint">يُحجز الرقم النهائي تلقائيًا عند الحفظ وفق التصنيف والأقدمية.</span></div>
            <div className="field span2"><label>الاسم الكامل بالعربية *</label><input required value={f.full_name_ar} onChange={set('full_name_ar')} /></div>
            <div className="field span2"><label>الاسم بالإنجليزية</label><input value={f.full_name_en || ''} onChange={set('full_name_en')} dir="ltr" /></div>
            <div className="field"><label>الجنسية</label><input value={f.nationality || ''} onChange={set('nationality')} /></div>
          </div>
        </fieldset>

        {isTemporary && (
          <fieldset>
            <legend>ارتباط الموظف البديل</legend>
            <div className="form-grid">
              <div className="field span2"><label>بديل عن *</label><select required value={f.replaces_employee_id || ''} onChange={(e)=>chooseReplacedEmployee(e.target.value)} disabled={!!id}><option value="">اختر الموظف المستبدل</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.employee_no} - {e.full_name_ar}</option>)}</select></div>
              <div className="field span2"><label>طلب الإجازة المرتبط *</label><select required value={f.replacement_leave_request_id || ''} onChange={(e)=>chooseLeaveRequest(e.target.value)} disabled={!f.replaces_employee_id || !!id}><option value="">اختر طلب الإجازة</option>{leaveRequests.map((r)=><option key={r.id} value={r.id}>{r.start_date} إلى {r.end_date} — {r.status === 'hr_reviewed' ? 'بانتظار الاعتماد النهائي' : r.status === 'ceo_approved' ? 'معتمد نهائيًا' : 'قيد الإجراء'}</option>)}</select></div>
              <div className="field"><label>المباشرة المتوقعة</label><input value={f.planned_start_date || ''} readOnly dir="ltr" /><span className="hint">أول يوم في فترة إجازة الموظف المستبدل.</span></div>
              <div className="field"><label>نهاية التغطية المتوقعة</label><input value={f.planned_end_date || ''} readOnly dir="ltr" /></div>
              <div className="field span2"><label>الحالة</label><input value="بانتظار الاعتماد النهائي وموعد المباشرة" readOnly /><span className="hint">لن يصبح الموظف على رأس العمل لمجرد إنشاء السجل.</span></div>
              {selectedReplaced && <div className="field span2"><span className="hint">سيتم نسخ المسمى والمهام والأجر والبدلات من {selectedReplaced.full_name_ar}، وتتحقق قاعدة البيانات من ذلك مرة أخرى عند الحفظ.</span></div>}
            </div>
          </fieldset>
        )}

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
            <OrgRoleFields value={f} onChange={setOrg} disabled={isTemporary} />
            {!isTemporary && <div className="field"><label>تاريخ المباشرة</label><input type="date" value={f.hire_date || ''} onChange={set('hire_date')} dir="ltr" /><span className="hint">يبدأ منه احتساب رصيد الإجازة السنوية.</span></div>}
            <div className="field"><label>الإجازة السنوية المتفق عليها</label><input type="number" min="1" step="1" value={f.annual_leave_days ?? 21} onChange={set('annual_leave_days')} dir="ltr" /><span className="hint">تستحق تدريجياً خلال 365 يوماً ولا تمنح كاملة من أول يوم.</span></div>
            {!isTemporary && <div className="field"><label>الحالة</label><select value={f.status} onChange={set('status')}><option value="active">على رأس العمل</option><option value="on_leave">في إجازة</option><option value="suspended">موقوف</option><option value="terminated">منتهي</option></select></div>}
            <div className="field span2"><label>المهام الوظيفية</label><textarea rows="3" value={f.duties || ''} onChange={set('duties')} readOnly={isTemporary} placeholder="اكتب المهام الفعلية باختصار" /><span className="hint">{isTemporary ? 'منسوخة من الموظف المستبدل.' : 'المهام لا تحدد صلاحية استخدام البرنامج.'}</span></div>
            <div className="field"><label>نسبة العمولة</label><input type="number" step="0.001" min="0" max="1" value={f.commission_rate} onChange={set('commission_rate')} readOnly={isTemporary} dir="ltr" /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>الراتب والبدلات</legend>
          <div className="form-grid">
            <div className="field"><label>الراتب الأساسي</label><input type="number" min="0" step="0.01" value={f.basic_salary} onChange={set('basic_salary')} readOnly={isTemporary} dir="ltr" /></div>
            <div className="field"><label>بدل السكن</label><input type="number" min="0" step="0.01" value={f.housing_allowance} onChange={set('housing_allowance')} readOnly={isTemporary} dir="ltr" /></div>
            <div className="field"><label>بدل النقل</label><input type="number" min="0" step="0.01" value={f.transport_allowance} onChange={set('transport_allowance')} readOnly={isTemporary} dir="ltr" /></div>
            <div className="field"><label>بدلات أخرى</label><input type="number" min="0" step="0.01" value={f.other_allowance} onChange={set('other_allowance')} readOnly={isTemporary} dir="ltr" /></div>
            <div className="field span2"><label>الراتب الإجمالي</label><input value={gross.toFixed(2)} readOnly dir="ltr" style={{background:'#F6EEEE',color:'#7C2B28',fontWeight:600}} /><span className="hint">محسوب تلقائياً</span></div>
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
