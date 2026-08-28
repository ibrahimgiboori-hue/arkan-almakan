'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function QuotePartyFields({ q, setQ, patch }) {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('employees')
        .select('id,full_name_ar,full_name_en,job_title,status')
        .in('status', ['active', 'on_leave'])
        .order('full_name_ar');
      if (alive) setEmployees(data || []);
    })();
    return () => { alive = false; };
  }, []);

  async function chooseArkanEmployee(employeeId) {
    if (!employeeId) {
      await patch({ arkan_signatory_employee_id:null });
      return;
    }
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    await patch({
      arkan_signatory_employee_id:employee.id,
      arkan_signatory_name:employee.full_name_ar || employee.full_name_en || '',
      arkan_signatory_title:employee.job_title || '',
    });
  }

  const individual = (q.client_kind || 'entity') === 'individual';

  return (
    <div className="quote-party-fields">
      <div className="quote-party-column">
        <h3>بيانات العميل</h3>
        <div className="form-grid">
          <div className="field">
            <label>نوع العميل</label>
            <select value={q.client_kind || 'entity'} onChange={(e)=>patch({ client_kind:e.target.value })}>
              <option value="entity">منشأة / شركة</option>
              <option value="individual">فرد</option>
            </select>
          </div>
          <div className="field span2">
            <label>{individual ? 'اسم العميل' : 'اسم المنشأة / العميل'}</label>
            <input
              value={q.client_name || ''}
              onChange={(e)=>setQ({...q,client_name:e.target.value})}
              onBlur={(e)=>patch({ client_name:e.target.value })}
            />
          </div>
          <div className="field">
            <label>بيانات التواصل</label>
            <input
              value={q.client_contact || ''}
              onChange={(e)=>setQ({...q,client_contact:e.target.value})}
              onBlur={(e)=>patch({ client_contact:e.target.value })}
            />
          </div>
          {!individual && <>
            <div className="field span2">
              <label>يمثله</label>
              <input
                value={q.client_representative_name || ''}
                placeholder="اسم ممثل العميل"
                onChange={(e)=>setQ({...q,client_representative_name:e.target.value})}
                onBlur={(e)=>patch({ client_representative_name:e.target.value || null })}
              />
            </div>
            <div className="field">
              <label>المنصب / الصفة</label>
              <input
                value={q.client_representative_title || ''}
                onChange={(e)=>setQ({...q,client_representative_title:e.target.value})}
                onBlur={(e)=>patch({ client_representative_title:e.target.value || null })}
              />
            </div>
          </>}
          {individual && <div className="field">
            <label>الصفة</label>
            <input
              value={q.client_representative_title || ''}
              placeholder="اختياري"
              onChange={(e)=>setQ({...q,client_representative_title:e.target.value})}
              onBlur={(e)=>patch({ client_representative_title:e.target.value || null })}
            />
          </div>}
        </div>
      </div>

      <div className="quote-party-column">
        <h3>بيانات أركان المكان</h3>
        <div className="form-grid">
          <div className="field span2">
            <label>اختيار المفوض بالتوقيع</label>
            <select value={q.arkan_signatory_employee_id || ''} onChange={(e)=>chooseArkanEmployee(e.target.value)}>
              <option value="">كتابة الاسم يدويًا</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name_ar || employee.full_name_en}{employee.job_title ? ` — ${employee.job_title}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field span2">
            <label>اسم المفوض</label>
            <input
              value={q.arkan_signatory_name || ''}
              placeholder="اختر موظفًا أو اكتب الاسم"
              onChange={(e)=>setQ({...q,arkan_signatory_name:e.target.value})}
              onBlur={(e)=>patch({ arkan_signatory_name:e.target.value || null, arkan_signatory_employee_id:null })}
            />
          </div>
          <div className="field">
            <label>المنصب / الصفة</label>
            <input
              value={q.arkan_signatory_title || ''}
              onChange={(e)=>setQ({...q,arkan_signatory_title:e.target.value})}
              onBlur={(e)=>patch({ arkan_signatory_title:e.target.value || null })}
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        .quote-party-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:18px}
        .quote-party-column{min-width:0;border:1px solid var(--hair);background:var(--paper);padding:14px 16px}
        .quote-party-column h3{margin:0 0 12px;color:var(--maroon-dark);font-size:15px}
        @media(max-width:900px){.quote-party-fields{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
