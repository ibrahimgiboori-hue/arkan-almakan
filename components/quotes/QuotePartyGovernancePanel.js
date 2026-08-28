'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CLIENT_KIND,
  employeeSignatoryPatch,
  isEntityClient,
  manualSignatoryPatch,
} from '@/lib/approval-governance';

const PARTY_FIELDS = [
  'id',
  'client_kind',
  'client_representative_name',
  'client_representative_title',
  'arkan_signatory_employee_id',
  'arkan_signatory_name',
  'arkan_signatory_title',
].join(',');

export default function QuotePartyGovernancePanel({ quoteId }) {
  const [record, setRecord] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!quoteId) return;
    const [quoteRes, employeesRes] = await Promise.all([
      supabase.from('quotations').select(PARTY_FIELDS).eq('id', quoteId).maybeSingle(),
      supabase.from('employees')
        .select('id,full_name_ar,job_title,board_role,person_kind,status')
        .eq('status', 'active')
        .order('full_name_ar'),
    ]);
    if (quoteRes.error || !quoteRes.data) {
      setError(quoteRes.error?.message || 'تعذر تحميل بيانات أطراف العرض.');
      return;
    }
    setError('');
    setRecord(quoteRes.data);
    setEmployees(employeesRes.data || []);
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  async function patch(fields, successMessage = 'حُفظت بيانات الأطراف') {
    if (!record) return;
    const next = { ...record, ...fields };
    setRecord(next);
    setMessage('');
    setError('');
    const { error: updateError } = await supabase.from('quotations').update(fields).eq('id', quoteId);
    if (updateError) {
      setError('تعذر الحفظ: ' + updateError.message);
      await load();
      return;
    }
    setMessage(successMessage);
    window.setTimeout(() => setMessage(''), 1500);
  }

  function updateDraft(field, value) {
    setRecord((previous) => previous ? { ...previous, [field]:value } : previous);
  }

  async function chooseEmployee(employeeId) {
    const employee = employees.find((item) => item.id === employeeId) || null;
    await patch(employeeSignatoryPatch(employee), employee ? 'تم تعيين ممثل أركان المكان' : 'تم إلغاء ممثل أركان المكان');
  }

  if (!record) {
    return <div className="section" style={{margin:'0 0 16px',padding:14}}>{error || 'جارٍ تحميل بيانات الأطراف…'}</div>;
  }

  const entityClient = isEntityClient(record);

  return (
    <section className="section" style={{margin:'0 0 16px',padding:0}} data-approval-governance="quotation">
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'11px 14px'}}>
        <div>
          <h2 style={{margin:0}}>الأطراف والاعتماد</h2>
          <div className="hint" style={{marginTop:3}}>قاعدة موحدة تتحكم في فرد/منشأة وممثل العميل وممثل أركان وما يظهر في الطباعة.</div>
        </div>
        <button type="button" className="btn ghost" onClick={()=>setOpen((value)=>!value)}>{open ? 'إخفاء' : 'إظهار'}</button>
      </header>

      {open && <div style={{padding:'0 14px 14px'}}>
        <div className="form-grid">
          <div className="field">
            <label>نوع العميل</label>
            <select value={record.client_kind || CLIENT_KIND.ENTITY} onChange={(e)=>patch({client_kind:e.target.value})}>
              <option value={CLIENT_KIND.ENTITY}>منشأة / شركة / جهة</option>
              <option value={CLIENT_KIND.INDIVIDUAL}>فرد</option>
            </select>
            <span className="hint">الفرد يوقّع باسمه ولا يظهر له «يمثله» أو «ختم الشركة».</span>
          </div>

          {entityClient && <>
            <div className="field">
              <label>يمثل العميل</label>
              <input
                value={record.client_representative_name || ''}
                onChange={(e)=>updateDraft('client_representative_name', e.target.value)}
                onBlur={(e)=>patch({client_representative_name:e.target.value || null})}
                placeholder="اسم الموقّع عن المنشأة"
              />
            </div>
            <div className="field">
              <label>صفته / منصبه</label>
              <input
                value={record.client_representative_title || ''}
                onChange={(e)=>updateDraft('client_representative_title', e.target.value)}
                onBlur={(e)=>patch({client_representative_title:e.target.value || null})}
                placeholder="مثال: مدير المشروع"
              />
            </div>
          </>}

          <div className="field">
            <label>ممثل أركان المكان</label>
            <select value={record.arkan_signatory_employee_id || ''} onChange={(e)=>chooseEmployee(e.target.value)}>
              <option value="">— بدون اختيار من الموظفين —</option>
              {employees.map((employee)=><option key={employee.id} value={employee.id}>
                {employee.full_name_ar}{employee.job_title ? ` — ${employee.job_title}` : ''}
              </option>)}
            </select>
            <span className="hint">الاختيار يحفظ لقطة الاسم والصفة داخل العرض حتى لا يتغير المستند القديم لاحقًا.</span>
          </div>

          <div className="field">
            <label>اسم ممثل أركان في المستند</label>
            <input
              value={record.arkan_signatory_name || ''}
              onChange={(e)=>updateDraft('arkan_signatory_name', e.target.value)}
              onBlur={(e)=>patch(manualSignatoryPatch(e.target.value, record.arkan_signatory_title))}
              placeholder="يمكن إدخاله يدويًا عند الحاجة"
            />
          </div>

          <div className="field">
            <label>صفة ممثل أركان</label>
            <input
              value={record.arkan_signatory_title || ''}
              onChange={(e)=>updateDraft('arkan_signatory_title', e.target.value)}
              onBlur={(e)=>patch({arkan_signatory_title:e.target.value || null})}
              placeholder="مثال: المدير العام"
            />
          </div>
        </div>

        {message ? <div className="msg ok" style={{marginTop:10}}>{message}</div> : null}
        {error ? <div className="msg err" style={{marginTop:10}}>{error}</div> : null}
      </div>}
    </section>
  );
}
