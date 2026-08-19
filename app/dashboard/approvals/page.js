'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const DECISION = { approved:'معتمد', rejected:'مرفوض' };
const ENTITY = {
  leave_requests:'إجازة',
  advances:'سلفة',
  progress_claims:'مستخلص',
  documents:'مستند',
};

export default function ApprovalsPage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    const { data, error } = await supabase.from('v_approval_register')
      .select('*').order('recorded_at', { ascending:false });
    if (error) { setErr('تعذر تحميل سجل الاعتمادات: ' + error.message); setRows([]); return; }
    setRows(data || []);
  }

  useEffect(() => { load(); }, []);

  if (!rows) return <div className="empty">جارٍ التحميل</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>سجل الاعتمادات</h1>
          <p>صاحب القرار الفعلي مستقل عن مستخدم البرنامج الذي سجل القرار.</p>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>الاعتمادات المسجلة</h2></header>
        {rows.length === 0 ? (
          <div className="empty"><h3>لا توجد اعتمادات مسجلة</h3><p>تظهر هنا القرارات بعد تسجيلها من العمليات المختلفة.</p></div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>المعاملة</th><th>المرحلة</th><th>القرار</th><th>صاحب القرار</th>
                <th>الصفة وقت القرار</th><th>تاريخ القرار</th><th>مسجل بالنظام بواسطة</th><th>وقت التسجيل</th>
              </tr></thead>
              <tbody>
                {rows.map((r)=><tr key={r.id}>
                  <td>{ENTITY[r.entity_table] || r.entity_table}</td>
                  <td>{r.stage_label_snapshot || 'غير محدد'}</td>
                  <td><span className={`pill ${r.decision==='rejected'?'bad':'ok'}`}>{DECISION[r.decision] || r.decision}</span></td>
                  <td>{r.actor_name || 'غير محدد'}</td>
                  <td>{r.actor_title || 'غير محدد'}</td>
                  <td className="mono">{dateAr(r.decision_date)}</td>
                  <td>{r.recorded_by_name || 'مستخدم النظام'}</td>
                  <td className="mono">{r.recorded_at ? new Date(r.recorded_at).toLocaleString('ar-SA-u-ca-gregory') : 'غير محدد'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
