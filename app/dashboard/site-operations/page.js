'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS = {
  full:    { ar:'كامل', short:'ك' },
  half:    { ar:'نصف', short:'½' },
  absent:  { ar:'غياب', short:'غ' },
  stopped: { ar:'توقف', short:'ت' },
  leave:   { ar:'إجازة', short:'إ' },
};
const CATEGORIES = ['وجبات','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','تأمين طبي','عهدة','أخرى'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function suggestCategory(text='') {
  const s = text.trim();
  if (/(بنزين|وقود|ديزل)/i.test(s)) return 'وقود';
  if (/(وجبة|وجبات|فطار|إفطار|غدا|غداء|عشاء)/i.test(s)) return 'وجبات';
  if (/(تذكرة|ترحيل|نقل|مواصل)/i.test(s)) return 'ترحيل';
  if (/(تأمين طبي|تامين طبي)/i.test(s)) return 'تأمين طبي';
  if (/(عهدة)/i.test(s)) return 'عهدة';
  if (/(خشب|منشار|كلبسات|مسامير|عدة|أداة|اداة|معدات)/i.test(s)) return 'عدد وأدوات';
  if (/(سكن|إيجار سكن|ايجار سكن)/i.test(s)) return 'سكن';
  return 'أخرى';
}
function looksRecoverable(text='') { return /(تأمين|تامين|عهدة|ضمان|مسترد)/i.test(text); }
function chargeField(category) {
  if (category === 'وجبات') return 'meals_charge_to';
  if (category === 'ترحيل' || category === 'وقود') return 'transport_charge_to';
  if (category === 'سكن') return 'housing_charge_to';
  if (category === 'عدد وأدوات' || category === 'سقالات') return 'tools_charge_to';
  return null;
}
const CHARGE_AR = { arkan:'أركان', contractor:'المقاول', owner:'المالك' };

export default function SiteOperationsPage() {
  const [projects,setProjects] = useState([]);
  const [projectId,setProjectId] = useState('');
  const [date,setDate] = useState(iso(new Date()));
  const [dayId,setDayId] = useState(null);
  const [workers,setWorkers] = useState([]);
  const [contractors,setContractors] = useState([]);
  const [marks,setMarks] = useState({});
  const [items,setItems] = useState([]);
  const [itemLinks,setItemLinks] = useState([]);
  const [outputs,setOutputs] = useState([]);
  const [expenses,setExpenses] = useState([]);
  const [reviewCount,setReviewCount] = useState(0);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState('');
  const [msg,setMsg] = useState('');
  const [err,setErr] = useState('');
  const [expenseFor,setExpenseFor] = useState(null);
  const [ef,setEf] = useState({ description:'',amount:'',category:'أخرى',payer:'contractor',charge_to:'arkan',is_recoverable:false,project_item_id:'' });

  useEffect(()=>{
    supabase.from('projects').select('id,project_no,name_ar').eq('status','active').order('project_no')
      .then(({data})=>setProjects(data||[]));
  },[]);

  const ensureDay = useCallback(async()=>{
    if (dayId) return dayId;
    const {data,error} = await supabase.rpc('fn_get_or_create_day',{p_project_id:projectId,p_date:date});
    if (error) throw error;
    setDayId(data); return data;
  },[dayId,projectId,date]);

  const load = useCallback(async()=>{
    if (!projectId || !date) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      const [dayQ,itemsQ,assignsQ,itemAssignsQ,reviewQ] = await Promise.all([
        supabase.from('timesheet_days').select('id').eq('project_id',projectId).eq('work_date',date).maybeSingle(),
        supabase.from('project_items').select('id,description_ar,unit,sort_order').eq('project_id',projectId).order('sort_order'),
        supabase.from('labor_project_assignments').select('laborer_id,contractor_id,valid_from,valid_to').eq('project_id',projectId).lte('valid_from',date).or(`valid_to.is.null,valid_to.gte.${date}`),
        supabase.from('v_item_assignments').select('project_item_id,item_name,unit,contractor_id,contractor_name,is_active,start_date,end_date').eq('project_id',projectId),
        supabase.from('v_contractor_expense_review').select('id').eq('project_id',projectId).not('review_reason','is',null),
      ]);
      const day=dayQ.data; const its=itemsQ.data||[]; const assigns=assignsQ.data||[];
      const itemAssigns=itemAssignsQ.data||[]; setItemLinks(itemAssigns);
      const did=day?.id||null; setDayId(did); setItems(its); setReviewCount((reviewQ.data||[]).length);

      let contractorIds=Array.from(new Set([
        ...assigns.map(x=>x.contractor_id),
        ...itemAssigns.filter(x=>x.contractor_id && (x.is_active!==false || (!x.end_date || x.end_date>=date))).map(x=>x.contractor_id),
      ].filter(Boolean)));
      const laborerIds=Array.from(new Set(assigns.map(x=>x.laborer_id).filter(Boolean)));
      let labs=[];
      if(laborerIds.length){
        const {data}=await supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,pay_basis,contractor_id,is_active').in('id',laborerIds).eq('is_active',true).order('full_name');
        labs=data||[];
      } else if(contractorIds.length){
        const {data}=await supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,pay_basis,contractor_id,is_active').in('contractor_id',contractorIds).eq('is_active',true).order('full_name');
        labs=data||[];
      }

      let att=[]; let out=[];
      if(did){
        const [a,o]=await Promise.all([
          supabase.from('attendance').select('id,laborer_id,status,contractor_id_snapshot,amount').eq('day_id',did),
          supabase.from('day_items').select('id,project_item_id,contractor_id,group_output,unit').eq('day_id',did),
        ]);
        att=a.data||[]; out=o.data||[];
        contractorIds=Array.from(new Set([...contractorIds,...att.map(x=>x.contractor_id_snapshot)].filter(Boolean)));
      }
      const ee=await supabase.from('contractor_expenses').select('id,contractor_id,category,amount,notes,is_recoverable').eq('project_id',projectId).eq('expense_date',date).order('created_at');
      const ex=ee.data||[]; contractorIds=Array.from(new Set([...contractorIds,...ex.map(x=>x.contractor_id)].filter(Boolean)));
      const cc=contractorIds.length
        ? await supabase.from('contractors').select('id,name_ar,meals_charge_to,transport_charge_to,housing_charge_to,tools_charge_to').in('id',contractorIds).order('name_ar')
        : {data:[]};
      setContractors(cc.data||[]);

      const assignmentByWorker=Object.fromEntries(assigns.map(x=>[x.laborer_id,x.contractor_id]));
      setWorkers(labs.map(w=>({...w,contractor_id:assignmentByWorker[w.id]||w.contractor_id})));
      setMarks(Object.fromEntries(att.map(a=>[a.laborer_id,a]))); setOutputs(out); setExpenses(ex);
    }catch(e){setErr('تعذّر فتح يوم التشغيل: '+(e.message||e));}
    setLoading(false);
  },[projectId,date]);

  useEffect(()=>{load();},[load]);

  const groups=useMemo(()=>contractors.map(c=>({...c,
    workers:workers.filter(w=>w.contractor_id===c.id),
    outputs:outputs.filter(o=>o.contractor_id===c.id),
    expenses:expenses.filter(e=>e.contractor_id===c.id),
  })).filter(g=>g.workers.length||g.outputs.length||g.expenses.length),[contractors,workers,outputs,expenses]);

  async function markWorker(w,status){
    setBusy('att-'+w.id); setErr('');
    try{
      const id=await ensureDay();
      const {data,error}=await supabase.from('attendance').upsert({day_id:id,laborer_id:w.id,status,rate_used:Number(w.daily_rate||0)},{onConflict:'day_id,laborer_id'}).select('id,laborer_id,status,contractor_id_snapshot,amount').single();
      if(error)throw error; setMarks(m=>({...m,[w.id]:data}));
    }catch(e){setErr(e.message||String(e));} setBusy('');
  }

  async function markAll(g,status='full'){
    const pending=g.workers.filter(w=>!marks[w.id]); if(!pending.length)return;
    setBusy('group-'+g.id); setErr('');
    try{
      const id=await ensureDay();
      const payload=pending.map(w=>({day_id:id,laborer_id:w.id,status,rate_used:Number(w.daily_rate||0)}));
      const {data,error}=await supabase.from('attendance').upsert(payload,{onConflict:'day_id,laborer_id'}).select('id,laborer_id,status,contractor_id_snapshot,amount');
      if(error)throw error;
      setMarks(m=>({...m,...Object.fromEntries((data||[]).map(a=>[a.laborer_id,a]))})); setMsg(`سُجّل ${pending.length} فرداً دفعة واحدة`);
    }catch(e){setErr(e.message||String(e));} setBusy('');
  }

  async function addOutput(g){
    const linkedIds=itemLinks.filter(x=>x.contractor_id===g.id && x.start_date<=date && (!x.end_date||x.end_date>=date)).map(x=>x.project_item_id);
    const pool=(linkedIds.length?items.filter(x=>linkedIds.includes(x.id)):items).filter(it=>!outputs.some(o=>o.contractor_id===g.id&&o.project_item_id===it.id));
    if(!pool.length){setErr('لا يوجد بند متاح لهذا المقاول في هذا اليوم');return;}
    let item=pool[0];
    if(pool.length>1){
      const choice=window.prompt('اختر رقم البند:\n'+pool.map((x,i)=>`${i+1}) ${x.description_ar}`).join('\n'),'1');
      if(choice===null)return; item=pool[Math.max(0,Math.min(pool.length-1,Number(choice||1)-1))];
    }
    const qty=window.prompt(`الكمية المنفذة — ${item.description_ar}`,''); if(qty===null||qty==='')return;
    setBusy('out-'+g.id); setErr('');
    try{
      const id=await ensureDay();
      const {data,error}=await supabase.from('day_items').insert({day_id:id,project_item_id:item.id,contractor_id:g.id,group_output:Number(qty),unit:item.unit||null}).select('id,project_item_id,contractor_id,group_output,unit').single();
      if(error)throw error; setOutputs(x=>[...x,data]); setMsg('حُفظ إنجاز اليوم');
    }catch(e){setErr(e.message||String(e));} setBusy('');
  }

  function openExpense(g){setExpenseFor(g.id);setEf({description:'',amount:'',category:'أخرى',payer:'contractor',charge_to:'arkan',is_recoverable:false,project_item_id:''});}
  function changeDescription(v){
    const cat=suggestCategory(v),rec=looksRecoverable(v),c=contractors.find(x=>x.id===expenseFor),fld=chargeField(cat);
    setEf(x=>({...x,description:v,category:cat,is_recoverable:rec,charge_to:fld&&c?.[fld]?c[fld]:x.charge_to,project_item_id:rec?'':x.project_item_id}));
  }
  function changeCategory(cat){const c=contractors.find(x=>x.id===expenseFor),fld=chargeField(cat);setEf(x=>({...x,category:cat,charge_to:fld&&c?.[fld]?c[fld]:x.charge_to}));}
  async function saveExpense(e){
    e.preventDefault(); if(!expenseFor)return; setBusy('expense'); setErr('');
    try{
      const payload={project_id:projectId,contractor_id:expenseFor,expense_date:date,amount:Number(ef.amount),category:ef.category,payer:ef.payer,charge_to:ef.charge_to,is_recoverable:!!ef.is_recoverable,project_item_id:ef.is_recoverable?null:(ef.project_item_id||null),notes:ef.description||null};
      const {data,error}=await supabase.from('contractor_expenses').insert(payload).select('id,contractor_id,category,amount,notes,is_recoverable').single();
      if(error)throw error; setExpenses(x=>[...x,data]);setExpenseFor(null);setMsg('حُفظ المصروف في سياق اليوم دون إعادة اختيار المشروع والمقاول');load();
    }catch(ex){setErr('تعذّر حفظ المصروف: '+(ex.message||ex));} setBusy('');
  }

  return <div dir="rtl">
    <div className="page-head"><div><h1>تشغيل الموقع</h1><p>المشروع والتاريخ مرة واحدة — ثم الحضور والإنجاز والمصروف من نفس المكان.</p></div></div>
    <div className="section" style={{marginTop:0}}><div style={{padding:16,display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
      <div className="field" style={{minWidth:260}}><label>المشروع</label><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">— اختر —</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>)}</select></div>
      <div className="field"><label>التاريخ</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <button className="btn ghost" onClick={load} disabled={!projectId||loading}>{loading?'جارٍ الفتح…':'تحديث'}</button>
      {reviewCount>0&&<span className="pill warn">{reviewCount} مصروف يحتاج مراجعة تصنيف</span>}
    </div></div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}{msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}
    {!projectId&&<div className="empty"><h3>ابدأ بالمشروع والتاريخ</h3><p>لن نطلبهما منك مرة أخرى داخل حركات اليوم.</p></div>}
    {projectId&&!loading&&groups.length===0&&<div className="empty"><h3>لا عمالة مسندة لهذا التاريخ</h3><p>يمكن ربط العمال بالمشروع بفترة عمل، ثم سيظهرون هنا تلقائياً.</p></div>}

    {groups.map(g=>{const pending=g.workers.filter(w=>!marks[w.id]),done=g.workers.filter(w=>marks[w.id]);return <div className="section" key={g.id} style={{marginTop:12}}>
      <header><div><h2>{g.name_ar}</h2><div style={{fontSize:12.5,color:'var(--ink-soft)'}}>{pending.length} غير مسجل · {done.length} تم تسجيله</div></div><div className="rowsplit"><button className="btn" style={sm} disabled={!pending.length||busy==='group-'+g.id} onClick={()=>markAll(g,'full')}>حضور الباقين</button><button className="btn ghost" style={sm} onClick={()=>addOutput(g)}>+ إنجاز</button><button className="btn ghost" style={sm} onClick={()=>openExpense(g)}>+ مصروف</button></div></header>
      <div style={{padding:16}}><div style={{fontWeight:600,marginBottom:8}}>غير المسجلين</div>
        {pending.length===0?<div style={{fontSize:13,color:'#2E6B3A'}}>اكتمل تسجيل عمال هذا المقاول.</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(245px,1fr))',gap:8}}>{pending.map(w=><div key={w.id} style={{border:'1px solid #e8e3e2',borderRadius:8,padding:10,background:'#fff'}}><div style={{fontWeight:600}}>{w.full_name}</div><div style={{fontSize:11.5,color:'#777',margin:'2px 0 8px'}}>{w.trade||w.labor_class||'—'}</div><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{[['full','كامل'],['half','نصف'],['absent','غياب']].map(([k,t])=><button key={k} type="button" className="btn ghost" style={{padding:'3px 9px',fontSize:12}} disabled={busy==='att-'+w.id} onClick={()=>markWorker(w,k)}>{t}</button>)}</div></div>)}</div>}
        {done.length>0&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontSize:13,color:'var(--ink-soft)'}}>تم التسجيل ({done.length}) — اضغط للمراجعة</summary><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>{done.map(w=><button key={w.id} type="button" className="btn ghost" style={{padding:'4px 9px',fontSize:12}} onClick={()=>{const ks=['full','half','absent','stopped','leave'],cur=marks[w.id]?.status;markWorker(w,ks[(ks.indexOf(cur)+1)%ks.length]);}}>{STATUS[marks[w.id]?.status]?.short||'؟'} · {w.full_name}</button>)}</div></details>}
        {(g.outputs.length>0||g.expenses.length>0)&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:10,marginTop:16}}><div style={box}><b>إنجاز اليوم</b>{g.outputs.length===0?<div style={muted}>لا يوجد</div>:g.outputs.map(o=><div key={o.id} style={line}>{items.find(i=>i.id===o.project_item_id)?.description_ar||'بند'} · <span dir="ltr">{o.group_output} {o.unit||''}</span></div>)}</div><div style={box}><b>مصروفات اليوم</b>{g.expenses.length===0?<div style={muted}>لا يوجد</div>:g.expenses.map(x=><div key={x.id} style={line}>{x.category} · <span dir="ltr">{Number(x.amount||0).toLocaleString('en-US')}</span>{x.is_recoverable&&<span className="pill warn" style={{fontSize:10,marginInlineStart:5}}>مسترد</span>}<div style={muted}>{x.notes||''}</div></div>)}</div></div>}
      </div></div>})}

    {expenseFor&&<div className="section" style={{marginTop:12}}><header><h2>مصروف سريع — {contractors.find(c=>c.id===expenseFor)?.name_ar}</h2><button className="btn ghost" style={sm} onClick={()=>setExpenseFor(null)}>إغلاق</button></header><form onSubmit={saveExpense} style={{padding:16}}><div className="form-grid">
      <div className="field span2"><label>البيان</label><input required autoFocus value={ef.description} onChange={e=>changeDescription(e.target.value)} placeholder="مثال: بنزين سيارة الموقع"/></div>
      <div className="field"><label>المبلغ</label><input required type="number" min="0" step="0.01" dir="ltr" value={ef.amount} onChange={e=>setEf({...ef,amount:e.target.value})}/></div>
      <div className="field"><label>التصنيف المقترح</label><select value={ef.category} onChange={e=>changeCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="field"><label>من دفع؟</label><select value={ef.payer} onChange={e=>setEf({...ef,payer:e.target.value})}><option value="contractor">دفعه المقاول</option><option value="arkan_custody">دفعته أركان من العهدة</option><option value="arkan_direct">دفعته أركان مباشرة</option></select></div>
      <div className="field"><label>على من يُحمّل؟</label><select value={ef.charge_to} onChange={e=>setEf({...ef,charge_to:e.target.value})}>{Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>طبيعة المبلغ</label><select value={ef.is_recoverable?'1':'0'} onChange={e=>setEf({...ef,is_recoverable:e.target.value==='1',project_item_id:e.target.value==='1'?'':ef.project_item_id})}><option value="0">مصروف نهائي</option><option value="1">مبلغ مسترد / تأمين / عهدة</option></select></div>
      {!ef.is_recoverable&&<div className="field"><label>البند — فقط إن كان مباشرًا</label><select value={ef.project_item_id} onChange={e=>setEf({...ef,project_item_id:e.target.value})}><option value="">لا يُربط ببند</option>{items.map(i=><option key={i.id} value={i.id}>{i.description_ar}</option>)}</select></div>}
    </div>{ef.is_recoverable&&<div className="msg" style={{marginTop:10}}>لن يُحمّل هذا المبلغ على تكلفة البند؛ سيبقى مبلغاً مسترداً حتى تتم تسويته.</div>}<div className="rowsplit"><button className="btn" disabled={busy==='expense'}>{busy==='expense'?'جارٍ الحفظ…':'حفظ المصروف'}</button></div></form></div>}
  </div>;
}

const sm={padding:'4px 10px',fontSize:12.5};
const box={border:'1px solid #ebe6e5',borderRadius:8,padding:10,background:'#fbfbfb'};
const line={padding:'6px 0',borderBottom:'1px solid #eee',fontSize:12.5};
const muted={fontSize:11.5,color:'#777',marginTop:4};
