'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Settings() {
  const [s, setS] = useState(null);

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => setS(data));
  }, []);

  if (!s) return <div className="empty">جارٍ التحميل…</div>;

  const rows = [
    ['الاسم بالعربية', s.company_name_ar],
    ['الاسم بالإنجليزية', s.company_name_en],
    ['السجل التجاري', s.cr_number],
    ['الرقم الضريبي', s.vat_number || 'لم يُسجّل بعد'],
    ['المدينة', s.city],
    ['الجوال الأول', s.phone_1],
    ['الجوال الثاني', s.phone_2],
    ['البريد الإلكتروني', s.email],
    ['الموقع', s.website],
    ['نسبة ضريبة القيمة المضافة', `${(Number(s.vat_rate) * 100).toFixed(0)}%`],
    ['هامش الترويسة العلوي', `${s.letterhead_top_mm} مم`],
    ['هامش الترويسة السفلي', `${s.letterhead_bottom_mm} مم`],
    ['الهوامش الجانبية', `${s.letterhead_side_mm} مم`],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>بيانات الشركة</h1>
          <p>تُستخدم في كل مستند يصدر من النظام</p>
        </div>
      </div>

      <div className="grid k2">
        <div className="section" style={{marginTop:0}}>
          <header><h2>البيانات الرسمية</h2></header>
          <table>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{color:'#58595B',width:'45%'}}>{k}</td>
                  <td>{v || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section" style={{marginTop:0}}>
          <header><h2>ألوان الهوية</h2></header>
          <div style={{padding:18}}>
            {[['العنابي الأساسي', s.color_primary],
              ['العنابي الغامق', s.color_primary_dark],
              ['العنابي الفاتح', s.color_primary_light],
              ['رمادي النص', s.color_text]].map(([n, c]) => (
              <div key={n} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <span style={{width:38,height:38,background:c,border:'1px solid #E4D9D9'}} />
                <span style={{flex:1}}>{n}</span>
                <span className="mono" style={{color:'#58595B'}}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
