'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, qty as fq, dateAr } from '@/lib/format';
import { CHARGE_AR } from '@/lib/projects';

const DOC_KINDS = ['محضر استلام','تقرير يومي','تقرير أسبوعي','صورة موقع','مراسلة مع المالك','مخطط','أخرى'];

export default function ProjDocs({ project, canWrite, mode = 'all' }) {
  const showDocs = mode === 'all' || mode === 'documents';
  const showMaterials = mode === 'all' || mode === 'materials';
  const [docs, setDocs] = useState([]);
  const [centralDocs, setCentralDocs] = useState([]);
  const [mats, setMats] = useState([]);
  const [nd, setNd] = useState({ doc_kind:'محضر استلام', title:'', description:'' });
  const [file, setFile] = useState(null);
  const [nm, setNm] = useState({ material_name:'', unit:'', qty_in:'', unit_cost:'', supplier:'', charge_to:'arkan' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const tasks = [];
    if (showDocs) {
      tasks.push(supabase.from('site_documents').select('*').eq('project_id', project.id).order('doc_date', { ascending: false }));
      tasks.push(
        supabase
          .from('documents')
          .select('id,doc_number,subject,status,created_at,updated_at,template_code,internal_approval_status')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
      );
    }
    if (showMaterials) tasks.push(supabase.from('project_materials').select('*').eq('project_id', project.id).order('received_at', { ascending: false }));
    const results = await Promise.all(tasks);
    let i = 0;
    if (showDocs) {
      const siteResult = results[i++];
      const centralResult = results[i++];
      setDocs(siteResult?.data || []);
      setCentralDocs(centralResult?.data || []);
      if (siteResult?.error || centralResult?.error) {
        setErr(siteResult?.error?.message || centralResult?.error?.message || 'تعذّر تحميل مستندات المشروع');
      }
    }
    if (showMaterials) setMats(results[i++]?.data || []);
  }

  useEffect(() => { load(); }, [project.id, mode]);

  async function addDoc(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    let path = null;
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      path = `${project.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('site-docs').upload(path, file);
      if (up.error) { setErr('تعذّر رفع الملف: ' + up.error.message); setBusy(false); return; }
    }
    const { error } = await supabase.from('site_documents').insert({ project_id: project.id, ...nd, file_path: path });
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
    // الخطأ كان يُبتلع كليًا: يعود الصف بعد load() بلا أي تفسير للمستخدم.
    const { error } = await supabase.from('project_materials').delete().eq('id', id);
    if (error) setErr('تعذّر حذف المادة: ' + error.message);
    load();
  }

  const laborOnly = project.supply_scope === 'labor_only';

  return <>
    {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    {showDocs && <>
      {canWrite && <form onSubmit={addDoc} className="section" style={{marginTop:0}}>
        <header><h2>إضافة مستند موقع</h2></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            <div className="field"><label>النوع</label><select value={nd.doc_kind} onChange={(e)=>setNd({...nd,doc_kind:e.target.value})}>{DOC_KINDS.map(k=><option key={k}>{k}</option>)}</select></div>
            <div className="field span2"><label>العنوان *</label><input required value={nd.title} onChange={(e)=>setNd({...nd,title:e.target.value})}/></div>
            <div className="field span2"><label>الوصف</label><input value={nd.description} onChange={(e)=>setNd({...nd,description:e.target.value})}/></div>
            <div className="field"><label>الملف</label><input type="file" accept="image/*,application/pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)} style={{fontSize:13}}/></div>
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy?'جارٍ…':'إضافة مستند'}</button>
        </div>
      </form>}

      <div className="section">
        <header><h2>مستندات المشروع النظامية ({centralDocs.length})</h2></header>
        {centralDocs.length===0?<div className="empty"><h3>لا مستندات نظامية مرتبطة</h3><p>التقارير والنماذج المنشأة من نظام المستندات ستظهر هنا تلقائيًا عند ربطها بالمشروع.</p></div>:
        <div style={{overflowX:'auto'}}><table><thead><tr><th>التاريخ</th><th>المرجع</th><th>الموضوع</th><th>الحالة</th><th style={{width:150}}>فتح</th></tr></thead><tbody>{centralDocs.map(d=><tr key={d.id}><td className="mono">{dateAr(d.updated_at||d.created_at)}</td><td className="mono">{d.doc_number||'—'}</td><td>{d.subject||'مستند مشروع'}<div style={{fontSize:12,color:'var(--ink-soft)'}}>{d.template_code||''}</div></td><td><span className="pill" style={{fontSize:11.5}}>{d.internal_approval_status||d.status||'draft'}</span></td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><a className="btn ghost" href={`/dashboard/documents/edit/${d.id}`}>فتح</a><a className="btn ghost" href={`/print/${d.id}`} target="_blank" rel="noreferrer">طباعة</a></div></td></tr>)}</tbody></table></div>}
      </div>

      <div className="section" style={{marginTop:18}}>
        <header><h2>مستندات الموقع ({docs.length})</h2></header>
        {docs.length===0?<div className="empty"><h3>لا مستندات موقع</h3><p>محاضر الاستلام والتقارير والصور تحفظ كسجل مستقل للمشروع.</p></div>:
        <table><thead><tr><th>التاريخ</th><th>النوع</th><th>العنوان</th><th>الملف</th>{canWrite&&<th style={{width:70}}>—</th>}</tr></thead><tbody>{docs.map(d=><tr key={d.id}><td className="mono">{dateAr(d.doc_date)}</td><td>{d.doc_kind}</td><td>{d.title}{d.description&&<div style={{fontSize:12,color:'var(--ink-soft)'}}>{d.description}</div>}</td><td>{d.file_path?<button className="btn ghost" onClick={()=>openFile(d.file_path)}>فتح</button>:'—'}</td>{canWrite&&<td><button className="btn ghost" onClick={()=>delDoc(d.id)}>حذف</button></td>}</tr>)}</tbody></table>}
      </div>
    </>}

    {showMaterials && <div className="section" style={{marginTop:showDocs?18:0}}>
      <header><h2>المواد</h2>{laborOnly&&<span style={{fontSize:12.5,color:'var(--warn)'}}>مشروع مصنعية — المواد تُراجع كتكلفة مستقلة</span>}</header>
      {canWrite&&<form onSubmit={addMat} style={{padding:18,borderBottom:'1px solid var(--hair)'}}>
        <div className="form-grid">
          <div className="field span2"><label>المادة *</label><input required value={nm.material_name} onChange={(e)=>setNm({...nm,material_name:e.target.value})}/></div>
          <div className="field"><label>الوحدة</label><input value={nm.unit} onChange={(e)=>setNm({...nm,unit:e.target.value})}/></div>
          <div className="field"><label>الكمية</label><input type="number" step="any" dir="ltr" value={nm.qty_in} onChange={(e)=>setNm({...nm,qty_in:e.target.value})}/></div>
          <div className="field"><label>سعر الوحدة</label><input type="number" step="0.01" dir="ltr" value={nm.unit_cost} onChange={(e)=>setNm({...nm,unit_cost:e.target.value})}/></div>
          <div className="field"><label>على من تُحمَّل</label><select value={nm.charge_to} onChange={(e)=>setNm({...nm,charge_to:e.target.value})}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field span2"><label>المورد</label><input value={nm.supplier} onChange={(e)=>setNm({...nm,supplier:e.target.value})}/></div>
        </div><button className="btn" type="submit">تسجيل المادة</button>
      </form>}
      {mats.length===0?<div className="empty"><h3>لا مواد</h3><p>{laborOnly?'لا مواد مسجلة على المشروع.':'سجّل المواد الواردة للموقع.'}</p></div>:
      <div style={{overflowX:'auto'}}><table><thead><tr><th>المادة</th><th className="num">وارد</th><th className="num">مستخدم</th><th className="num">الرصيد</th><th className="num">التكلفة</th><th>التحميل</th><th>المورد</th>{canWrite&&<th style={{width:70}}>—</th>}</tr></thead><tbody>{mats.map(m=><tr key={m.id}><td>{m.material_name}</td><td className="num">{fq(m.qty_in)} {m.unit}</td><td className="num">{canWrite?<input type="number" step="any" dir="ltr" defaultValue={m.qty_used} onBlur={(e)=>updMat(m.id,{qty_used:Number(e.target.value||0)})} style={{width:70,border:'1px solid var(--hair)',padding:'3px',textAlign:'left'}}/>:fq(m.qty_used)}</td><td className="num">{fq(m.qty_balance)}</td><td className="num">{money(m.total_cost)}</td><td><span className="pill" style={{fontSize:11.5}}>{CHARGE_AR[m.charge_to]}</span></td><td>{m.supplier||'—'}</td>{canWrite&&<td><button className="btn ghost" onClick={()=>delMat(m.id)}>حذف</button></td>}</tr>)}</tbody></table></div>}
    </div>}
  </>;
}
