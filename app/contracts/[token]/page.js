'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function CandidateContract(){
  const {token}=useParams(); const canvasRef=useRef(null); const drawing=useRef(false);
  const [d,setD]=useState(null),[loading,setLoading]=useState(true),[err,setErr]=useState(''),[code,setCode]=useState(''),[name,setName]=useState(''),[comment,setComment]=useState(''),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState('');
  useEffect(()=>{(async()=>{const {data,error}=await supabase.rpc('get_public_contract_draft',{p_token:token});if(error)setErr(error.message);setD(data);setLoading(false);})();},[token]);
  useEffect(()=>{const cv=canvasRef.current;if(!cv)return;const rect=cv.getBoundingClientRect(),ratio=window.devicePixelRatio||1;cv.width=Math.max(1,rect.width*ratio);cv.height=Math.max(1,180*ratio);const ctx=cv.getContext('2d');ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#222';},[d]);
  function pos(e){const r=canvasRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function start(e){drawing.current=true;const p=pos(e),ctx=canvasRef.current.getContext('2d');ctx.beginPath();ctx.moveTo(p.x,p.y);canvasRef.current.setPointerCapture?.(e.pointerId);}
  function move(e){if(!drawing.current)return;const p=pos(e),ctx=canvasRef.current.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();setSigned(true);}
  function end(){drawing.current=false;}
  function clear(){const cv=canvasRef.current;if(!cv)return;cv.getContext('2d').clearRect(0,0,cv.width,cv.height);setSigned(false);}
  async function respond(action){setErr('');if(!/^[0-9]{8}$/.test(code)){setErr('أدخل رمز التحقق المكوّن من 8 أرقام');return;}if(action==='accept'&&(!name.trim()||!signed)){setErr('للموافقة: اكتب اسمك وارسم توقيعك في خانة التوقيع');return;}if(action==='changes'&&!comment.trim()){setErr('اكتب الملاحظات المطلوب تعديلها');return;}setBusy(true);const sig=action==='accept'?canvasRef.current.toDataURL('image/png'):null;const {error}=await supabase.rpc('respond_to_contract_draft',{p_token:token,p_code:code,p_action:action,p_signer_name:action==='accept'?name.trim():null,p_signature_data:sig,p_comment:comment||null});setBusy(false);if(error){setErr(error.message);return;}setDone(action);}
  if(loading)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}>جارٍ تحميل مسودة العقد…</div>;
  if(!d)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}><div className="msg err">المسودة غير متاحة حالياً.</div></div>;
  if(done==='accept'||d.status==='accepted')return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:30,textAlign:'center'}}><h1>تم تسجيل موافقتك</h1><p style={{lineHeight:1.9}}>تم توثيق موافقتك على المسودة. ستتابع الموارد البشرية إجراءات المباشرة والتهيئة والإجراءات الرسمية اللازمة.</p></div></div>;
  if(done==='changes'||d.status==='candidate_changes')return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:30,textAlign:'center'}}><h1>تم إرسال ملاحظاتك</h1><p style={{lineHeight:1.9}}>وصلت ملاحظاتك إلى الموارد البشرية لإعادة مراجعة المسودة. ستصلك نسخة جديدة بعد استكمال التعديل والاعتماد الداخلي.</p></div></div>;
  if(done==='decline'||d.status==='declined')return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:30,textAlign:'center'}}><h1>تم تسجيل ردك</h1><p>نشكر لك وقتك ونتمنى لك التوفيق.</p></div></div>;
  return <div style={{maxWidth:840,margin:'28px auto 60px',padding:'0 18px',direction:'rtl'}}><div className="section" style={{padding:26,marginTop:0}}>
    <div style={{textAlign:'center',borderBottom:'1px solid var(--hair)',paddingBottom:18,marginBottom:20}}><div style={{fontSize:13,color:'var(--ink-soft)'}}>أركان المكان للمقاولات</div><h1 style={{margin:'6px 0'}}>مسودة عقد عمل</h1><div>{d.candidate_name} — {d.job_title}</div></div>
    {err&&<div className="msg err" style={{marginBottom:14}}>{err}</div>}
    <div style={{whiteSpace:'pre-wrap',lineHeight:2,border:'1px solid var(--hair)',padding:18,background:'#fff'}}>{d.contract_text||'لم يتم تحميل نص المسودة.'}</div>
    <div className="msg" style={{marginTop:18,lineHeight:1.8}}>هذه المسودة للمراجعة الداخلية بين الطرفين، ولا تستبدل إجراءات توثيق عقد العمل عبر المنصات الرسمية المعتمدة.</div>
    <h2 style={{fontSize:18,marginTop:28}}>رد المرشح</h2>
    <div className="form-grid"><div className="field span2"><label>الاسم عند الموافقة</label><input value={name} onChange={e=>setName(e.target.value)} placeholder={d.candidate_name}/></div><div className="field"><label>رمز التحقق (8 أرقام) *</label><input inputMode="numeric" maxLength="8" dir="ltr" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))}/></div></div>
    <div style={{marginTop:14}}><label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>التوقيع على الشاشة عند الموافقة</label><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{width:'100%',height:180,border:'1px solid var(--hair-strong)',background:'#fff',touchAction:'none',display:'block'}}/><button type="button" className="btn ghost" style={{marginTop:6,padding:'4px 10px',fontSize:12}} onClick={clear}>مسح التوقيع</button></div>
    <div className="field" style={{marginTop:14}}><label>ملاحظاتك على المسودة أو سبب الاعتذار</label><textarea rows="4" value={comment} onChange={e=>setComment(e.target.value)} placeholder="إذا كنت تريد تعديلاً، اكتب البند والملاحظة بوضوح"/></div>
    <div className="rowsplit" style={{marginTop:16,flexWrap:'wrap'}}><button className="btn" disabled={busy} onClick={()=>respond('accept')}>{busy?'جارٍ التسجيل…':'أوافق وأوقع'}</button><button className="btn ghost" disabled={busy} onClick={()=>respond('changes')}>لدي ملاحظات وأطلب التعديل</button><button className="btn ghost" disabled={busy} onClick={()=>respond('decline')}>أعتذر</button></div>
  </div></div>;
}
