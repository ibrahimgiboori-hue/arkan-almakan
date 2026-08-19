'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';

export default function CandidateOffer(){
  const {token}=useParams(); const canvasRef=useRef(null); const drawing=useRef(false);
  const [offer,setOffer]=useState(null),[loading,setLoading]=useState(true),[err,setErr]=useState(''),[code,setCode]=useState(''),[name,setName]=useState(''),[comment,setComment]=useState(''),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState('');
  useEffect(()=>{(async()=>{const {data,error}=await supabase.rpc('get_public_job_offer',{p_token:token});if(error)setErr(error.message);setOffer(data);setLoading(false);})();},[token]);
  useEffect(()=>{const cv=canvasRef.current;if(!cv)return;const resize=()=>{const rect=cv.getBoundingClientRect(),ratio=window.devicePixelRatio||1;const old=cv.toDataURL();cv.width=Math.max(1,rect.width*ratio);cv.height=Math.max(1,180*ratio);const ctx=cv.getContext('2d');ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#222';if(signed){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,rect.width,180);im.src=old;}};resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[offer]);
  function pos(e){const r=canvasRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function start(e){drawing.current=true;const p=pos(e);const ctx=canvasRef.current.getContext('2d');ctx.beginPath();ctx.moveTo(p.x,p.y);canvasRef.current.setPointerCapture?.(e.pointerId);}
  function move(e){if(!drawing.current)return;const p=pos(e),ctx=canvasRef.current.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();setSigned(true);}
  function end(){drawing.current=false;}
  function clear(){const cv=canvasRef.current;if(!cv)return;cv.getContext('2d').clearRect(0,0,cv.width,cv.height);setSigned(false);}
  async function respond(accept){setErr('');if(!/^[0-9]{8}$/.test(code)){setErr('أدخل رمز التحقق المكوّن من 8 أرقام');return;}if(accept&&(!name.trim()||!signed)){setErr('للقبول: اكتب اسمك وارسم توقيعك في خانة التوقيع');return;}setBusy(true);const signature=accept?canvasRef.current.toDataURL('image/png'):null;const {error}=await supabase.rpc('respond_to_job_offer',{p_token:token,p_code:code,p_accept:accept,p_signer_name:accept?name.trim():null,p_signature_data:signature,p_comment:comment||null});setBusy(false);if(error){setErr(error.message);return;}setDone(accept?'accepted':'declined');}
  if(loading)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}>جارٍ تحميل العرض…</div>;
  if(!offer)return <div style={{maxWidth:760,margin:'60px auto',padding:24}}><div className="msg err">العرض غير متاح حالياً أو انتهت صلاحيته.</div></div>;
  if(done==='accepted'||offer.status==='accepted')return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:30,textAlign:'center'}}><h1>تم قبول العرض الوظيفي</h1><p style={{lineHeight:1.9}}>شكرًا لك. تم توثيق قبولك، وسيتم إعداد مسودة العقد ومراجعتها داخليًا قبل إرسالها إليك للقراءة والموافقة.</p></div></div>;
  if(done==='declined'||offer.status==='declined')return <div style={{maxWidth:720,margin:'70px auto',padding:24,direction:'rtl'}}><div className="section" style={{padding:30,textAlign:'center'}}><h1>تم تسجيل ردك</h1><p style={{lineHeight:1.9}}>نشكر لك وقتك واهتمامك، ونتمنى لك التوفيق.</p></div></div>;
  const gross=offer.salary_display_mode==='detailed'?[offer.basic_salary,offer.housing_allowance,offer.transport_allowance,offer.other_allowance].reduce((s,x)=>s+Number(x||0),0):offer.gross_salary;
  return <div style={{maxWidth:820,margin:'28px auto 60px',padding:'0 18px',direction:'rtl'}}>
    <div className="section" style={{padding:26,marginTop:0}}>
      <div style={{textAlign:'center',borderBottom:'1px solid var(--hair)',paddingBottom:18,marginBottom:20}}><div style={{fontSize:13,color:'var(--ink-soft)'}}>أركان المكان للمقاولات</div><h1 style={{margin:'6px 0'}}>عرض وظيفي</h1><div>السيد/ {offer.candidate_name}</div></div>
      {err&&<div className="msg err" style={{marginBottom:14}}>{err}</div>}
      <p style={{lineHeight:2}}>يسرنا أن نقدم لكم عرضنا للانضمام إلى فريق العمل وفق البيانات والشروط الموضحة أدناه. يرجى مراجعة العرض بعناية قبل تسجيل موافقتكم.</p>
      <div style={{overflowX:'auto'}}><table><tbody>
        <tr><th style={{width:'35%'}}>المسمى الوظيفي</th><td>{offer.job_title}</td></tr><tr><th>الإدارة / القسم</th><td>{offer.department||'—'}</td></tr>
        {offer.salary_display_mode==='gross_only'?<tr><th>إجمالي الراتب الشهري</th><td>{gross!=null?`${money(gross)} ريال`:'—'}</td></tr>:<><tr><th>الراتب الأساسي</th><td>{money(offer.basic_salary||0)} ريال</td></tr><tr><th>بدل السكن</th><td>{money(offer.housing_allowance||0)} ريال</td></tr><tr><th>بدل النقل</th><td>{money(offer.transport_allowance||0)} ريال</td></tr><tr><th>بدلات أخرى</th><td>{money(offer.other_allowance||0)} ريال</td></tr><tr><th>الإجمالي</th><td style={{fontWeight:700}}>{money(gross)} ريال</td></tr></>}
        <tr><th>ساعات العمل</th><td>{offer.daily_work_hours} ساعات عمل فعلية يوميًا وفق تنظيم العمل المعتمد لدى المنشأة والأنظمة المعمول بها.</td></tr><tr><th>فترة التجربة</th><td>{offer.probation_days} يوم</td></tr><tr><th>الإجازة السنوية</th><td>{offer.annual_leave_days!=null?`${offer.annual_leave_days} يوم`:'وفق العقد والسياسة المعتمدة'}</td></tr><tr><th>المباشرة المتوقعة</th><td>{dateAr(offer.expected_start_date)}</td></tr><tr><th>صلاحية العرض</th><td>حتى {dateAr(offer.valid_until)}</td></tr>
      </tbody></table></div>
      {offer.conditions_text&&<div style={{marginTop:18}}><h3>شروط وملاحظات</h3><div style={{whiteSpace:'pre-wrap',lineHeight:1.9}}>{offer.conditions_text}</div></div>}
      <div className="msg" style={{marginTop:18,lineHeight:1.8}}>هذا العرض يسبق العقد النهائي. بعد قبول العرض ستُعد مسودة العقد للمراجعة الداخلية ثم تُرسل لك لمراجعتها، ولا يحل هذا المستند محل إجراءات التوثيق الرسمية المعتمدة لدى الجهات المختصة.</div>

      <h2 style={{fontSize:18,marginTop:28}}>الرد على العرض</h2>
      <div className="form-grid"><div className="field span2"><label>الاسم كما ترغب في إثباته مع التوقيع *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder={offer.candidate_name}/></div><div className="field"><label>رمز التحقق (8 أرقام) *</label><input inputMode="numeric" maxLength="8" dir="ltr" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))}/></div></div>
      <div style={{marginTop:14}}><label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>التوقيع على الشاشة</label><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{width:'100%',height:180,border:'1px solid var(--hair-strong)',background:'#fff',touchAction:'none',display:'block'}}/><button type="button" className="btn ghost" style={{marginTop:6,padding:'4px 10px',fontSize:12}} onClick={clear}>مسح التوقيع</button></div>
      <div className="field" style={{marginTop:14}}><label>ملاحظات أو سبب الاعتذار إن وجد</label><textarea rows="3" value={comment} onChange={e=>setComment(e.target.value)}/></div>
      <div className="rowsplit" style={{marginTop:16,flexWrap:'wrap'}}><button className="btn" disabled={busy} onClick={()=>respond(true)}>{busy?'جارٍ التسجيل…':'أوافق على العرض وأوقع'}</button><button className="btn ghost" disabled={busy} onClick={()=>respond(false)}>أعتذر عن العرض</button></div>
    </div>
  </div>;
}
