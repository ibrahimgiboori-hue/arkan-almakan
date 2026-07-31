'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, qty as fq, dateAr } from '@/lib/format';
import { CHARGE_AR } from '@/lib/projects';

const DOC_KINDS = ['محضر استلام','تقرير يومي','تقرير أسبوعي','صورة موقع',
                   'مراسلة مع المالك','مخطط','أخرى'];

export default function ProjDocs({ project, canWrite }) {
  const [docs, setDocs] = useState([]);
  const [mats, setMats] = useState([]);
  const [nd, setNd] = useState({ doc_kind:'محضر استلام', title:'', description:'' });
  const [file, setFile] = useState(null);
  const [nm, setNm] = useState({ material_name:'', unit:'', qty_in:'', unit_cost:'',
                                 supplier:'', charge_to:'arkan' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [d, m] = await Promise.all([
      supabase.from('site_documents').select('*').eq('project_id', project.id)
        .order('doc_date', { ascending: false }),
      supabase.from('project_materials').select('*').eq('project_id', project.id)
        .order('received_at', { ascending: false }),
    ]);
    setDocs(d.data || []); setMats(m.data || []);
  }

  useEffect(() => { load(); }, [project.id]);

  async function addDoc(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    let path = null;
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      path = `${project.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('site-docs').upload(path, file);
      if (up.error) { setErr('تعذّر رفع الملف: ' + up.error.message); setBusy(false); return; }
    }
    const { error } = await supabase.from('site_documents').insert({
      project_id: project.id, ...nd, file_path: path,
    });
    setBusy(false);
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('أُضيف المستند');
    setNd({ doc_kind:'محضر استلام', title:'', description:'' }); setFile(null); load();
  }

  async function openFile(path) {
    const { data, error } = await supabase.storage.from('site-docs').createSignedUrl(path, 300);
    if (error) { setErr('تعذّر الفتح: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function delDoc(id) {
    if (!window.confirm('حذف هذا المستند؟')) return;
    const { error } = await supabase.from('site_documents').delete().eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function addMat(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const { error } = await supabase.from('project_materials').insert({
      project_id: project.id,
      material_name: nm.material_name, unit: nm.unit || null,
      qty_in: Number(nm.qty_in || 0), unit_cost: Number(nm.unit_cost || 0),
      supplier: nm.supplier || null, charge_to: nm.charge_to,
      received_at: new Date().toISOString().slice(0,10),
    });
    if (error) { setErr(error.message); return; }
    setMsg('سُجّلت المادة');
    setNm({ material_name:'', unit:'', qty_in:'', unit_cost:'', supplier:'', charge_to:'arkan' });
    load();
  }

  async function updMat(id, fields) {
    const { error } = await supabase.from('project_materials').update(fields).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function delMat(id) {
    if (!window.confirm('حذف هذه المادة؟')) return;
    await supabase.from('project_materials').delete().eq('id', id);
    load();
  }

  const laborOnly = project.supply_scope === 'labor_only';

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {canWrite && (
        <form onSubmit={addDoc} className="section" style={{marginTop:0}}>
          <header><h2>إضافة مستند موقع</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>النوع</label>
                <select value={nd.doc_kind} onChange={(e)=>setNd({...nd, doc_kind:e.target.value})}>
                  {DOC_KINDS.map((k)=><option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="field span2">
                <label>العنوان *</label>
                <input required value={nd.title} onChange={(e)=>setNd({...nd, title:e.target.value})} />
              </div>
              <div className="field span2">
                <label>الوصف</label>
                <input value={nd.description} onChange={(e)=>setNd({...nd, description:e.target.value})} />
              </div>
              <div className="field">
                <label>الملف</label>
                <input type="file" accept="image/*,application/pdf"
                       onChange={(e)=>setFile(e.target.files?.[0] || null)} style={{fontSize:13}} />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'جارٍ…' : 'إضافة'}
            </button>
          </div>
        </form>
      )}

      <div className="section">
        <header><h2>مستندات الموقع ({docs.length})</h2></header>
        {docs.length === 0 ? (
          <div className="empty"><h3>لا مستندات</h3>
            <p>محاضر الاستلام والتقارير والصور — وثّقها لتحمي موقفك عند النزاع.</p></div>
        ) : (
          <table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>العنوان</th>
                       <th>الملف</th>{canWrite && <th style={{width:70}}>—</th>}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{dateAr(d.doc_date)}</td>
                  <td style={{fontSize:12.5}}>{d.doc_kind}</td>
                  <td>
                    {d.title}
                    {d.description && (
                      <div style={{fontSize:12,color:'var(--ink-soft)'}}>{d.description}</div>
                    )}
                  </td>
                  <td>
                    {d.file_path ? (
                      <button className="btn ghost" style={{padding:'4px 10px',fontSize:12.5}}
                              onClick={()=>openFile(d.file_path)}>فتح</button>
                    ) : '—'}
                  </td>
                  {canWrite && (
                    <td>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12,
                                      borderColor:'#EBC3C0',color:'#A32B24'}}
                              onClick={()=>delDoc(d.id)}>حذف</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section">
        <header>
          <h2>المواد</h2>
          {laborOnly && (
            <span style={{fontSize:12.5,color:'var(--warn)'}}>
              مشروع مصنعية — المواد هنا تُطالَب بها المالك
            </span>
          )}
        </header>

        {canWrite && (
          <form onSubmit={addMat} style={{padding:18,borderBottom:'1px solid var(--hair)'}}>
            <div className="form-grid">
              <div className="field span2">
                <label>المادة *</label>
                <input required value={nm.material_name}
                       onChange={(e)=>setNm({...nm, material_name:e.target.value})} />
              </div>
              <div className="field">
                <label>الوحدة</label>
                <input value={nm.unit} onChange={(e)=>setNm({...nm, unit:e.target.value})} />
              </div>
              <div className="field">
                <label>الكمية</label>
                <input type="number" step="any" dir="ltr" value={nm.qty_in}
                       onChange={(e)=>setNm({...nm, qty_in:e.target.value})} />
              </div>
              <div className="field">
                <label>سعر الوحدة</label>
                <input type="number" step="0.01" dir="ltr" value={nm.unit_cost}
                       onChange={(e)=>setNm({...nm, unit_cost:e.target.value})} />
              </div>
              <div className="field">
                <label>على من تُحمَّل</label>
                <select value={nm.charge_to} onChange={(e)=>setNm({...nm, charge_to:e.target.value})}>
                  {Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field span2">
                <label>المورد</label>
                <input value={nm.supplier} onChange={(e)=>setNm({...nm, supplier:e.target.value})} />
              </div>
            </div>
            <button className="btn" type="submit">تسجيل المادة</button>
          </form>
        )}

        {mats.length === 0 ? (
          <div className="empty"><h3>لا مواد</h3>
            <p>{laborOnly ? 'لا مواد على أركان في مشاريع المصنعية.' : 'سجّل المواد الواردة للموقع.'}</p></div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>المادة</th><th className="num">وارد</th><th className="num">مستخدم</th>
                    <th className="num">الرصيد</th><th className="num">التكلفة</th>
                    <th>التحميل</th><th>المورد</th>{canWrite && <th style={{width:70}}>—</th>}</tr>
              </thead>
              <tbody>
                {mats.map((m) => (
                  <tr key={m.id}>
                    <td>{m.material_name}</td>
                    <td className="num">{fq(m.qty_in)} {m.unit}</td>
                    <td className="num">
                      {canWrite ? (
                        <input type="number" step="any" dir="ltr" defaultValue={m.qty_used}
                               onBlur={(e)=>updMat(m.id,{qty_used:Number(e.target.value||0)})}
                               style={{width:70,border:'1px solid var(--hair)',padding:'3px',textAlign:'left'}} />
                      ) : fq(m.qty_used)}
                    </td>
                    <td className="num">{fq(m.qty_balance)}</td>
                    <td className="num">{money(m.total_cost)}</td>
                    <td><span className="pill" style={{fontSize:11.5}}>{CHARGE_AR[m.charge_to]}</span></td>
                    <td style={{fontSize:12.5}}>{m.supplier || '—'}</td>
                    {canWrite && (
                      <td>
                        <button className="btn ghost" style={{padding:'3px 8px',fontSize:12,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>delMat(m.id)}>حذف</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
