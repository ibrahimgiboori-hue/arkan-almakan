'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CLAIM_AR, CLAIM_CLASS } from '@/lib/projects';

const MAROON = '#8B3332';

const FALLBACK_STAGES = [
  { stage:'draft', seq:1, name_ar:'مسودة القياس', docs:[] },
  { stage:'submitted', seq:2, name_ar:'مطالبة مقدمة', docs:[] },
  { stage:'owner_approved', seq:3, name_ar:'مطالبة معتمدة', docs:[] },
  { stage:'collected', seq:4, name_ar:'تم السداد', docs:[] },
];

const NEXT = {
  draft: ['submitted','تقديم المطالبة'],
  submitted: ['owner_approved','تسجيل اعتماد الجهة'],
  owner_approved: ['collected','تسجيل السداد'],
};

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export default function ProjClaims({ project, canWrite, onChange }) {
  const [rows,setRows] = useState(null);
  const [steps,setSteps] = useState([]);
  const [docs,setDocs] = useState({});
  const [checks,setChecks] = useState({});
  const [open,setOpen] = useState(null);
  const [upl,setUpl] = useState(null);
  const [measurementDate,setMeasurementDate] = useState(todayLocal());
  const [busy,setBusy] = useState(false);
  const [busyDel,setBusyDel] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  async function load() {
    const { data:c,error:ce } = await supabase.from('progress_claims')
      .select('*').eq('project_id',project.id).order('seq_no');
    if (ce) { setErr(ce.message); return; }
    setRows(c || []);

    const ids = (c || []).map(x=>x.id);
    if (!ids.length) {
      setDocs({}); setChecks({}); onChange?.(); return;
    }

    const [att,val] = await Promise.all([
      supabase.from('op_attachments').select('*')
        .eq('entity_type','claim').in('entity_id',ids).order('created_at'),
      supabase.from('v_claim_validation').select('*').in('claim_id',ids),
    ]);

    const grouped = {};
    (att.data || []).forEach(x=>{ (grouped[x.entity_id] = grouped[x.entity_id] || []).push(x); });
    setDocs(grouped);

    const validation = {};
    (val.data || []).forEach(x=>{ validation[x.claim_id] = x; });
    setChecks(validation);
    onChange?.();
  }

  useEffect(()=>{
    (async()=>{
      const [defs,dcs] = await Promise.all([
        supabase.from('claim_stage_defs').select('*').order('seq'),
        supabase.from('claim_stage_docs').select('*').order('seq'),
      ]);
      const byStage = {};
      (dcs.data || []).forEach(d=>{ (byStage[d.stage] = byStage[d.stage] || []).push(d); });
      const built = (defs.data || [])
        .filter(x=>x.stage !== 'invoiced')
        .map(x=>({ ...x, docs:byStage[x.stage] || [] }));
      setSteps(built.length ? built : FALLBACK_STAGES);
    })();
  },[]);

  useEffect(()=>{ load(); },[project.id]);

  const stepOf = st => steps.find(s=>s.stage===st);
  const docsAt = (cid,st,code) => (docs[cid] || []).filter(d=>d.stage===st && (!code || d.doc_code===code));

  const lacking = c => {
    const st = stepOf(c.status);
    if (!st) return [];
    return (st.docs || []).filter(d=>d.required && docsAt(c.id,d.stage,d.code).length===0);
  };

  const issueHref = (c,code) => {
    if (code==='claim_sheet') return `/print/claim/${c.id}?doc=measure`;
    if (code==='cover_letter') return `/print/claim/${c.id}?doc=demand`;
    if (code==='inv_request') return `/print/claim/${c.id}?doc=memo`;
    if (code==='payment_receipt_notice') return `/print/claim/${c.id}?doc=receipt`;
    return `/print/claim/${c.id}?doc=demand`;
  };

  async function createClaim() {
    if (!measurementDate) { setErr('حدد تاريخ القياس أولاً'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { data,error } = await supabase.rpc('create_progress_claim',{
      p_project:project.id,
      p_measurement_date:measurementDate,
    });
    if (error) setErr(error.message);
    else {
      const r = Array.isArray(data) ? data[0] : data;
      setMsg(`تم إنشاء ${r?.claim_no || 'المستخلص'} عن الفترة من ${dateAr(r?.period_from)} إلى ${dateAr(r?.period_to)}`);
      await load();
    }
    setBusy(false);
  }

  async function markIssued(claim,doc) {
    const ref = window.prompt(`رقم أو مرجع ${doc.name_ar} - اختياري`) ?? '';
    const { error } = await supabase.from('op_attachments').insert({
      entity_type:'claim', entity_id:claim.id, stage:doc.stage,
      doc_code:doc.code, direction:'out', title:doc.name_ar,
      ref_no:ref || null, notes:'صادر من النظام',
    });
    if (error) setErr(error.message);
    else { setMsg(`تم توثيق إصدار ${doc.name_ar}`); load(); }
  }

  async function uploadDoc(claim,doc,file,ref,amount) {
    setBusy(true); setErr('');
    try {
      const safe = file.name.replace(/[^\w.\-]/g,'_');
      const path = `claims/${claim.id}/${doc.code}_${Date.now()}_${safe}`;
      const up = await supabase.storage.from('docs').upload(path,file);
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from('op_attachments').insert({
        entity_type:'claim', entity_id:claim.id, stage:doc.stage,
        doc_code:doc.code, direction:doc.direction, title:doc.name_ar,
        file_path:path, ref_no:ref || null, amount:amount ? Number(amount) : null,
      });
      if (error) throw new Error(error.message);
      setMsg('تم رفع المستند وتوثيقه'); setUpl(null); await load();
    } catch(e) { setErr(e.message); }
    setBusy(false);
  }

  async function openFile(path) {
    const { data,error } = await supabase.storage.from('docs').createSignedUrl(path,120);
    if (error) setErr(error.message); else window.open(data.signedUrl,'_blank');
  }

  async function delDoc(a) {
    if (!window.confirm('حذف هذا المستند من سجل المستخلص؟')) return;
    if (a.file_path) await supabase.storage.from('docs').remove([a.file_path]);
    const { error } = await supabase.from('op_attachments').delete().eq('id',a.id);
    if (error) setErr(error.message); else load();
  }

  async function advance(claim,to) {
    setErr(''); setMsg('');
    const chk = await supabase.rpc('claim_can_advance',{ p_claim:claim.id });
    const r = Array.isArray(chk.data) ? chk.data[0] : chk.data;
    if (chk.error) { setErr(chk.error.message); return; }
    if (r && r.ok===false) { setErr(r.reason); setOpen(claim.id); return; }

    let ref = null;
    let amount = null;

    if (to==='owner_approved') {
      ref = window.prompt('مرجع اعتماد الجهة - اختياري') ?? null;
    }

    if (to==='collected') {
      const v = window.prompt('المبلغ المسدد',String(claim.net_payable || ''));
      if (v===null) return;
      amount = Number(v);
      if (!Number.isFinite(amount) || amount<0) { setErr('المبلغ المسدد غير صحيح'); return; }
      ref = window.prompt('مرجع التحويل أو السداد - اختياري') ?? null;
    }

    const { error } = await supabase.rpc('advance_claim',{
      p_claim:claim.id, p_to:to, p_ref:ref, p_amount:amount,
    });
    if (error) setErr(error.message);
    else { setMsg('تم تحديث حالة المستخلص'); load(); }
  }

  async function recordInvoice(claim) {
    const no = window.prompt('رقم الفاتورة الضريبية',claim.invoice_no || '');
    if (no===null) return;
    if (!no.trim()) { setErr('رقم الفاتورة مطلوب'); return; }
    const { error } = await supabase.rpc('record_claim_invoice',{
      p_claim:claim.id, p_invoice_no:no.trim(), p_invoice_date:todayLocal(),
    });
    if (error) setErr(error.message);
    else { setMsg('تم تسجيل بيانات الفاتورة'); load(); }
  }

  async function goBack(claim) {
    if (!window.confirm(`إرجاع ${claim.claim_no} خطوة واحدة للتصحيح؟`)) return;
    const { error } = await supabase.rpc('rollback_claim_one_step',{ p_claim:claim.id });
    if (error) setErr(error.message);
    else { setMsg('تم إرجاع المستخلص خطوة واحدة'); load(); }
  }

  async function upd(id,fields) {
    const { error } = await supabase.from('progress_claims').update(fields).eq('id',id);
    if (error) setErr(error.message); else load();
  }

  async function hardDelete(claim) {
    const typed = window.prompt(`حذف نهائي للمستخلص ${claim.claim_no} بكل بنوده ومستنداته.\nاكتب: حذف`);
    if (typed===null) return;
    if (typed.trim()!=='حذف') { setErr('لم يتم الحذف لأن كلمة التأكيد غير مطابقة'); return; }
    setBusyDel(true); setErr('');
    try {
      const { data,error } = await supabase.rpc('delete_claim_deep',{ p_claim:claim.id });
      if (error) throw new Error(error.message);
      const r = Array.isArray(data) ? data[0] : data;
      if (r?.files?.length) await supabase.storage.from('docs').remove(r.files);
      setMsg(`تم حذف ${r?.deleted_no || claim.claim_no}`); await load();
    } catch(e) { setErr(e.message); }
    setBusyDel(false);
  }

  if (!rows) return <div className="empty">جارٍ التحميل</div>;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {canWrite && (
        <div className="section" style={{marginTop:0,marginBottom:12,padding:12}}>
          <div className="rowsplit" style={{alignItems:'end'}}>
            <div className="field" style={{margin:0,minWidth:180}}>
              <label>تاريخ القياس</label>
              <input type="date" value={measurementDate} onChange={e=>setMeasurementDate(e.target.value)} />
            </div>
            <button className="btn" onClick={createClaim} disabled={busy}>
              {busy?'جارٍ الإنشاء':'إنشاء مستخلص من الإنجاز حتى تاريخ القياس'}
            </button>
            <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>
              المستخلص الأول يبدأ من أول تنفيذ مسجل. المستخلص التالي يبدأ من اليوم التالي لتاريخ القياس السابق.
            </span>
          </div>
        </div>
      )}

      <div className="section" style={{marginTop:0,overflowX:'auto'}}>
        <table>
          <thead><tr>
            <th>الرقم</th><th>الفترة</th><th className="num">أعمال الفترة</th><th className="num">الوعاء</th><th className="num">الضريبة</th>
            <th className="num">محتجزات</th><th className="num">استرداد مقدمة</th><th className="num">المستحق</th>
            <th>الحالة</th><th>المستندات</th><th style={{width:300}}>الإجراءات</th>
          </tr></thead>
          <tbody>
            {rows.map(c=>{
              const nx = NEXT[c.status];
              const need = lacking(c);
              const validation = checks[c.id];
              const issues = validation?.issues || [];
              const invoiceFile = docsAt(c.id,'collected','tax_invoice').length>0;
              const invoiceComplete = !!c.invoice_no && !!c.invoiced_at && invoiceFile;

              return <React.Fragment key={c.id}>
                <tr>
                  <td className="mono">{c.claim_no}</td>
                  <td className="mono" style={{fontSize:12.5}}>{dateAr(c.period_from)} - {dateAr(c.period_to)}</td>
                  <td className="num">{money(c.gross_amount)}</td>
                  <td className="num">{money(c.taxable_base)}</td>
                  <td className="num" style={{color:MAROON}}>{money(c.vat_amount)}</td>
                  <td className="num">{canWrite && c.status==='draft'
                    ? <input type="number" step="0.01" dir="ltr" defaultValue={c.retention_amount} onBlur={e=>upd(c.id,{retention_amount:Number(e.target.value||0)})} style={inp}/>
                    : money(c.retention_amount)}</td>
                  <td className="num">{canWrite && c.status==='draft'
                    ? <input type="number" step="0.01" dir="ltr" defaultValue={c.advance_recovery} onBlur={e=>upd(c.id,{advance_recovery:Number(e.target.value||0)})} style={inp}/>
                    : money(c.advance_recovery)}</td>
                  <td className="num" style={{fontWeight:700}}>{money(c.net_payable)}</td>
                  <td>
                    <span className={`pill ${CLAIM_CLASS[c.status] || ''}`}>{stepOf(c.status)?.name_ar || CLAIM_AR[c.status] || c.status}</span>
                    {c.status==='collected' && <div style={{fontSize:11,marginTop:3,color:invoiceComplete?'#2E6B3A':'#6a5b43'}}>{invoiceComplete?'الفاتورة موثقة':'بانتظار استكمال الفاتورة'}</div>}
                  </td>
                  <td>
                    <button className="btn ghost" style={mini} onClick={()=>setOpen(open===c.id?null:c.id)}>{(docs[c.id] || []).length} مستند</button>
                    {need.length>0 && <div style={{fontSize:11,color:'#8B3332',marginTop:3}}>ينقص: {need.map(d=>d.name_ar).join(' و ')}</div>}
                  </td>
                  <td>
                    <div className="rowsplit">
                      {c.status==='draft' && <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=measure`}>محضر القياس</a>}
                      {['submitted','owner_approved'].includes(c.status) && <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=demand`}>المطالبة المالية</a>}
                      {c.status==='collected' && <>
                        <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=receipt`}>إشعار استلام دفعة</a>
                        <a className="btn ghost" style={mini} target="_blank" rel="noreferrer" href={`/print/claim/${c.id}?doc=memo`}>طلب إصدار فاتورة</a>
                        {canWrite && <button className="btn ghost" style={mini} onClick={()=>recordInvoice(c)}>{c.invoice_no?'تعديل بيانات الفاتورة':'تسجيل بيانات الفاتورة'}</button>}
                      </>}
                      {canWrite && nx && <button className="btn" style={{...mini,opacity:need.length?0.55:1}} onClick={()=>advance(c,nx[0])}>{nx[1]}</button>}
                      {canWrite && c.status!=='draft' && <button className="btn ghost" style={mini} onClick={()=>goBack(c)}>رجوع خطوة</button>}
                      {canWrite && <button className="btn ghost" disabled={busyDel} style={{...mini,borderColor:'#EBC3C0',color:'#A32B24'}} onClick={()=>hardDelete(c)}>{busyDel?'جارٍ':'حذف نهائي'}</button>}
                    </div>
                  </td>
                </tr>

                {issues.length>0 && <tr><td colSpan={11} style={{background:'#fff7f6',color:'#6f2522',padding:'8px 12px',fontSize:12.5}}>
                  <strong>مراجعة مطلوبة:</strong> {issues.join(' | ')}. لم يعدل النظام هذه البيانات تلقائياً حتى لا يغير مستخلصاً سابقاً دون مراجعتك.
                </td></tr>}

                {open===c.id && <tr><td colSpan={11} style={{background:'#FCFAFA',padding:'10px 14px'}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:MAROON,marginBottom:8}}>سجل مستندات {c.claim_no}</div>
                  {steps.map(st=>{
                    const currentSeq = stepOf(c.status)?.seq || 0;
                    const isCur = st.stage===c.status;
                    const passed = currentSeq>st.seq;
                    return <div key={st.stage} style={{padding:'8px 0',borderBottom:'1px solid #f1eded',opacity:(isCur||passed)?1:.45}}>
                      <div style={{fontSize:13,fontWeight:isCur?700:500,color:isCur?MAROON:'#444',marginBottom:4}}>
                        {st.name_ar}{isCur?' - المرحلة الحالية':''}
                      </div>
                      {(st.docs || []).map(d=>{
                        const list = docsAt(c.id,d.stage,d.code);
                        const lack = d.required && list.length===0 && (isCur||passed);
                        return <div key={d.code} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'4px 0 4px 14px'}}>
                          <div style={{minWidth:210}}>
                            <span style={{fontSize:12.5}}>{d.name_ar}{!d.required && <span style={{color:'#777',fontSize:11}}> - اختياري</span>}</span>
                            <div style={{fontSize:10.5,color:'#666'}}>
                              {d.direction==='out'?'يصدره النظام':'يرفع من خارج النظام'}{d.hint_ar?` - ${d.hint_ar}`:''}
                            </div>
                          </div>
                          <div style={{flex:1}}>
                            {list.length===0
                              ? <span style={{fontSize:12,color:lack?'#A32B24':'#777'}}>{lack?'مطلوب ولم يوثق':'غير مرفق'}</span>
                              : list.map(a=><div key={a.id} style={{fontSize:12,marginBottom:2}}>
                                  <span style={{color:'#2E6B3A'}}>موثق</span>
                                  {a.ref_no && <span className="mono" style={{color:'#555'}}> - {a.ref_no}</span>}
                                  {a.doc_date && <span style={{color:'#666'}}> - {dateAr(a.doc_date)}</span>}
                                  {a.file_path && <button className="btn ghost" style={tiny} onClick={()=>openFile(a.file_path)}>فتح</button>}
                                  {canWrite && <button className="btn ghost" style={{...tiny,color:'#A32B24'}} onClick={()=>delDoc(a)}>حذف</button>}
                                </div>)}
                          </div>
                          {canWrite && (isCur||passed) && <div className="rowsplit">
                            {d.direction==='out' && <>
                              <a className="btn ghost" style={tiny} target="_blank" rel="noreferrer" href={issueHref(c,d.code)}>طباعة</a>
                              <button className="btn ghost" style={tiny} onClick={()=>markIssued(c,d)}>توثيق الإصدار</button>
                            </>}
                            <button className="btn ghost" style={tiny} onClick={()=>setUpl({claim:c,doc:d})}>رفع ملف</button>
                          </div>}
                        </div>;
                      })}
                    </div>;
                  })}
                </td></tr>}
              </React.Fragment>;
            })}
            {rows.length===0 && <tr><td colSpan={11}><div className="empty"><h3>لا توجد مستخلصات</h3><p>سجل الإنجاز أولاً ثم أنشئ المستخلص بتاريخ القياس.</p></div></td></tr>}
          </tbody>
        </table>
      </div>

      {upl && <UploadBox
        step={upl.doc}
        busy={busy}
        onCancel={()=>setUpl(null)}
        onSave={(f,ref,amt)=>uploadDoc(upl.claim,upl.doc,f,ref,amt)}
      />}
    </>
  );
}

function UploadBox({ step,busy,onCancel,onSave }) {
  const [file,setFile] = useState(null);
  const [ref,setRef] = useState('');
  const [amount,setAmount] = useState('');
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}} onClick={onCancel}>
    <div onClick={e=>e.stopPropagation()} dir="rtl" style={{background:'#fff',borderRadius:8,padding:20,width:420,maxWidth:'92vw',color:'#222'}}>
      <h3 style={{margin:'0 0 4px',fontSize:16,color:MAROON}}>{step?.name_ar || 'مستند'}</h3>
      <p style={{fontSize:12.5,color:'#555',margin:'0 0 14px'}}>{step?.hint_ar || (step?.direction==='out'?'ارفع نسخة المستند الصادر':'ارفع المستند الوارد الذي يثبت هذه الخطوة')}</p>
      <div className="field" style={{marginBottom:10}}><label>الملف</label><input type="file" onChange={e=>setFile(e.target.files?.[0] || null)}/></div>
      <div className="field" style={{marginBottom:10}}><label>الرقم أو المرجع</label><input value={ref} onChange={e=>setRef(e.target.value)}/></div>
      <div className="field" style={{marginBottom:16}}><label>المبلغ - إن وجد</label><input type="number" step="0.01" dir="ltr" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
      <div className="rowsplit">
        <button className="btn" disabled={!file||busy} onClick={()=>onSave(file,ref,amount)}>{busy?'جارٍ الرفع':'رفع وتوثيق'}</button>
        <button className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  </div>;
}

const inp = { width:90,border:'1px solid var(--hair)',padding:'3px',textAlign:'left' };
const mini = { padding:'4px 9px',fontSize:12.5 };
const tiny = { padding:'2px 8px',fontSize:11.5,marginInlineStart:6 };
