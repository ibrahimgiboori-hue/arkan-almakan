'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { OPS, CMP, allKeys, SECTION_KINDS, FIELD_TYPES, uid } from '@/lib/form-engine';
import PartyCards, { partyGroup } from '@/components/PartyCards';
import { DOCUMENT_CATEGORY_META } from '@/lib/document-catalog.mjs';

const RETIRED_PRINT_KEYS = new Set(['margin_top_mm','margin_bottom_mm','margin_side_mm']);

export default function FormBuilder() {
  const { code } = useParams();
  const [t,setT]=useState(null);
  const [tab,setTab]=useState('sections');
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');

  const load=useCallback(()=>supabase.from('document_templates').select('*').eq('code',code).maybeSingle().then(({data})=>data?setT(data):setErr('النموذج غير موجود.')),[code]);
  useEffect(()=>{load();},[load]);
  const flash=(m)=>{setMsg(m);setTimeout(()=>setMsg(''),1500);};

  async function save(fields){
    const userOwned=t?.template_source==='user'||String(t?.code||'').startsWith('CUSTOM_');
    if(!userOwned){setErr('قالب الكتالوج محمي. أنشئ نسخة مخصصة من شاشة محرر النماذج ثم عدّل النسخة.');return;}
    const clean=Object.fromEntries(Object.entries(fields||{}).filter(([key])=>!RETIRED_PRINT_KEYS.has(key)));
    if(!Object.keys(clean).length)return;
    const next={...t,...clean};setT(next);
    const {error}=await supabase.from('document_templates').update(clean).eq('code',code);
    if(error)setErr('تعذّر الحفظ: '+error.message);else flash('حُفظ');
  }

  const sections=t?.layout?.sections||[];
  const setSections=(s)=>save({layout:{...(t.layout||{}),sections:s}});
  const patchSection=(id,fields)=>setSections(sections.map((s)=>s.id===id?{...s,...fields}:s));

  function addSection(kind){
    setSections([...sections,{
      id:uid(),kind,style:['cards','text','parties'].includes(kind)?'info':'strict',title:SECTION_KINDS[kind],
      ...(kind==='cards'||kind==='totals'?{fields:[]}:{}),
      ...(kind==='table'?{columns:[]}:{}),
      ...(kind==='text'?{key:'text_'+uid()}:{}),
      ...(kind==='signatures'?{roles:['الموظف','المدير التنفيذي']}:{}),
      ...(kind==='parties'?{key:'parties_'+uid(),groups:[partyGroup(2)]}:{}),
    }]);
  }
  function moveSection(id,dir){const i=sections.findIndex((s)=>s.id===id),j=i+dir;if(i<0||j<0||j>=sections.length)return;const next=[...sections];[next[i],next[j]]=[next[j],next[i]];setSections(next);}
  function addField(sid,isColumn){const s=sections.find((x)=>x.id===sid);const list=isColumn?(s.columns||[]):(s.fields||[]);const columns=Number(t?.layout?.gridColumns||12);const item={key:'f_'+uid(),label:'حقل جديد',type:'text',span:isColumn?Math.round(columns/3):Math.round(columns/2)};patchSection(sid,isColumn?{columns:[...list,item]}:{fields:[...list,item]});}
  function patchField(sid,idx,isColumn,fields){const s=sections.find((x)=>x.id===sid);const list=[...(isColumn?s.columns:s.fields)];list[idx]={...list[idx],...fields};patchSection(sid,isColumn?{columns:list}:{fields:list});}
  function delField(sid,idx,isColumn){const s=sections.find((x)=>x.id===sid);const list=(isColumn?s.columns:s.fields).filter((_,i)=>i!==idx);patchSection(sid,isColumn?{columns:list}:{fields:list});}

  const logic=t?.logic||[];
  const setLogic=(L)=>save({logic:L});
  const keys=t?allKeys(t.layout):[];
  function addRule(){setLogic([...logic,{id:uid(),target:'',op:'multiply',a:'',b:'',scope:'doc'}]);}
  function patchRule(id,fields){setLogic(logic.map((L)=>L.id===id?{...L,...fields}:L));}
  function delRule(id){setLogic(logic.filter((L)=>L.id!==id));}

  if(err&&!t)return <div className="msg err">{err}</div>;
  if(!t)return <div className="empty">جارٍ التحميل…</div>;

  const userOwned=t.template_source==='user'||String(t.code||'').startsWith('CUSTOM_');
  if(!userOwned)return <>
    <div className="page-head"><div><h1>{t.name_ar}</h1><p className="mono">{t.code}</p></div><Link className="btn ghost" href="/dashboard/formbuilder">كل النماذج</Link></div>
    <div className="msg err" style={{lineHeight:1.9}}>هذا قالب مركزي محمي حتى تبقى جميع المطبوعات متوافقة مع الدستور. من شاشة محرر النماذج استخدم «نسخ للتعديل»، ثم عدّل نسختك الخاصة.</div>
    <div style={{marginTop:14}}><Link className="btn" href={`/dashboard/documents/new/${t.code}`}>تعبئة النموذج كما هو</Link></div>
  </>;

  const gridColumns=Number(t.layout?.gridColumns||12);
  const spanTotal=(list)=>(list||[]).reduce((n,f)=>n+Number(f.span||0),0);

  return <>
    <div className="page-head">
      <div><h1>{t.name_ar}</h1><p><span className="mono">{t.code}</span> — {sections.length} قسماً و{logic.length} معادلة</p></div>
      <div className="rowsplit"><Link className="btn" href={`/dashboard/documents/new/${t.code}`}>تعبئة وتجربة</Link><Link className="btn ghost" href="/dashboard/formbuilder">كل النماذج</Link></div>
    </div>
    {err&&<div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

    <div className="tabs">{[['sections','الأقسام والحقول'],['logic','المعادلات'],['meta','بيانات النموذج']].map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>

    {tab==='sections'&&<>
      <div className="rowsplit" style={{marginBottom:14,flexWrap:'wrap'}}>{Object.entries(SECTION_KINDS).map(([k,label])=><button key={k} className="btn ghost" onClick={()=>addSection(k)}>+ {label}</button>)}</div>
      {sections.length===0&&<div className="section" style={{marginTop:0}}><div className="empty"><h3>النموذج فارغ</h3><p>أضف قسماً من الأزرار أعلاه — ابدأ ببطاقات المعلومات ثم جدول البنود.</p></div></div>}
      {sections.map((s,si)=>{
        const isTable=s.kind==='table';const list=isTable?(s.columns||[]):(s.fields||[]);const hasFields=['cards','totals','table'].includes(s.kind);const total=spanTotal(list);
        return <div className="section" key={s.id} style={{marginTop:si===0?0:18}}>
          <header><h2>{SECTION_KINDS[s.kind]} — {s.title||'بلا عنوان'}</h2><div className="rowsplit">
            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>moveSection(s.id,-1)}>▲</button>
            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>moveSection(s.id,1)}>▼</button>
            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>setSections(sections.filter((x)=>x.id!==s.id))}>حذف القسم</button>
          </div></header>
          <div style={{padding:16}}>
            <div className="form-grid"><div className="field span2"><label>عنوان القسم</label><input value={s.title||''} onChange={(e)=>patchSection(s.id,{title:e.target.value})} /></div><div className="field"><label>النمط البصري</label><select value={s.style} onChange={(e)=>patchSection(s.id,{style:e.target.value})}><option value="info">معلومة — رمادي ناعم</option><option value="strict">إلزامي أو مالي — شفاف بحد حاد</option></select></div></div>
            {s.kind==='text'&&<div className="field"><label>مفتاح النص</label><input dir="ltr" value={s.key||''} onChange={(e)=>patchSection(s.id,{key:e.target.value})} /><span className="hint">يُستخدم في المعادلات والتعبئة</span></div>}
            {s.kind==='parties'&&<div style={{marginTop:6}}><div className="field" style={{maxWidth:280}}><label>مفتاح القسم</label><input dir="ltr" value={s.key||''} onChange={(e)=>patchSection(s.id,{key:e.target.value})} /><span className="hint">تُحفظ تحته البطاقات في بيانات المستند</span></div><p style={{fontSize:12.5,color:'var(--ink-soft)',margin:'10px 0 12px'}}>ما تكتبه هنا يصير القيمة الافتراضية التي تظهر عند تعبئة المستند، ويبقى قابلاً للتعديل حينها.</p><PartyCards value={s.groups?.length?s.groups:[partyGroup(2)]} onChange={(g)=>patchSection(s.id,{groups:g})} /></div>}
            {s.kind==='signatures'&&<div className="field"><label>أعمدة التواقيع — مفصولة بفاصلة</label><input value={(s.roles||[]).join(', ')} onChange={(e)=>patchSection(s.id,{roles:e.target.value.split(',').map((x)=>x.trim()).filter(Boolean)})} /></div>}
            {hasFields&&<>
              <div className="rowsplit" style={{margin:'10px 0'}}><button className="btn ghost" onClick={()=>addField(s.id,isTable)}>+ {isTable?'عمود':'حقل'}</button><span className="spacer" /><span style={{fontSize:12.5,color:total===gridColumns?'var(--ok)':total>gridColumns?'var(--bad)':'var(--ink-soft)'}}>مجموع العروض: {total} من {gridColumns} {total===gridColumns?'✓':total>gridColumns?'— تجاوز الشبكة':''}</span></div>
              {list.length>0&&<table style={{fontSize:13}}><thead><tr><th>التسمية العربية</th><th>الإنجليزية</th><th style={{width:120}}>المفتاح</th><th style={{width:100}}>النوع</th><th style={{width:80}}>العرض</th><th style={{width:70}}>إلزامي</th><th style={{width:80}}>محسوب</th><th style={{width:60}}>—</th></tr></thead><tbody>
                {list.map((f,i)=><tr key={f.key+i}>
                  <td><input value={f.label||''} onChange={(e)=>patchField(s.id,i,isTable,{label:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',padding:'3px 5px',fontFamily:'inherit'}} /></td>
                  <td><input dir="ltr" value={f.labelEn||''} onChange={(e)=>patchField(s.id,i,isTable,{labelEn:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',padding:'3px 5px',fontFamily:'inherit'}} /></td>
                  <td><input dir="ltr" value={f.key} onChange={(e)=>patchField(s.id,i,isTable,{key:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',padding:'3px 5px',fontFamily:'inherit'}} /></td>
                  <td><select value={f.type} onChange={(e)=>patchField(s.id,i,isTable,{type:e.target.value})} style={{width:'100%',fontSize:12.5}}>{Object.entries(FIELD_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
                  <td><input type="number" min="1" max={gridColumns} data-grid-columns={gridColumns} dir="ltr" value={f.span||1} onChange={(e)=>patchField(s.id,i,isTable,{span:Number(e.target.value)})} style={{width:'100%',border:'1px solid var(--hair)',padding:'3px 5px',textAlign:'left'}} /></td>
                  <td style={{textAlign:'center'}}><input type="checkbox" checked={!!f.required} onChange={(e)=>patchField(s.id,i,isTable,{required:e.target.checked})} /></td>
                  <td style={{textAlign:'center'}}><input type="checkbox" checked={!!f.computed} onChange={(e)=>patchField(s.id,i,isTable,{computed:e.target.checked})} /></td>
                  <td><button className="btn ghost" style={{padding:'2px 7px',fontSize:12}} onClick={()=>delField(s.id,i,isTable)}>حذف</button></td>
                </tr>)}
              </tbody></table>}
            </>}
          </div>
        </div>;
      })}
    </>}

    {tab==='logic'&&<>
      <div className="rowsplit" style={{marginBottom:14}}><button className="btn" onClick={addRule}>+ معادلة</button><span className="spacer" /><span style={{fontSize:13,color:'var(--ink-soft)'}}>تُحسب بالترتيب — فمعادلة تستطيع أن تبني على ناتج سابقة</span></div>
      <div className="section" style={{marginTop:0,overflowX:'auto'}}><table><thead><tr><th style={{width:150}}>الحقل الناتج</th><th style={{width:170}}>العملية</th><th style={{width:150}}>أ</th><th style={{width:150}}>ب</th><th style={{width:120}}>النطاق</th><th style={{width:160}}>الشرط</th><th style={{width:60}}>—</th></tr></thead><tbody>
        {logic.map((L)=><tr key={L.id}>
          <td><select value={L.target||''} onChange={(e)=>patchRule(L.id,{target:e.target.value})} style={{width:'100%',fontSize:12.5}}><option value="">—</option>{keys.map((k)=><option key={k.key} value={k.key}>{k.label} ({k.key})</option>)}</select></td>
          <td><select value={L.op} onChange={(e)=>patchRule(L.id,{op:e.target.value})} style={{width:'100%',fontSize:12.5}}>{Object.entries(OPS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></td>
          <td><select value={L.a||''} onChange={(e)=>patchRule(L.id,{a:e.target.value})} style={{width:'100%',fontSize:12.5}}><option value="">—</option>{keys.map((k)=><option key={k.key} value={k.key}>{k.label}</option>)}</select></td>
          <td>{OPS[L.op]?.arity>1?<select value={L.b||''} onChange={(e)=>patchRule(L.id,{b:e.target.value})} style={{width:'100%',fontSize:12.5}}><option value="">—</option>{keys.map((k)=><option key={k.key} value={k.key}>{k.label}</option>)}</select>:<span style={{color:'var(--ink-soft)',fontSize:12.5}}>—</span>}</td>
          <td><select value={L.scope||'doc'} onChange={(e)=>patchRule(L.id,{scope:e.target.value})} style={{width:'100%',fontSize:12.5}}><option value="doc">المستند</option><option value="row">كل سطر جدول</option></select></td>
          <td>{L.op==='condition'?<div className="rowsplit"><select value={L.cmp||'lt'} onChange={(e)=>patchRule(L.id,{cmp:e.target.value})} style={{fontSize:12}}>{Object.entries(CMP).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select value={L.then||''} onChange={(e)=>patchRule(L.id,{then:e.target.value})} style={{fontSize:12}}><option value="">القيمة عند التحقق…</option>{keys.map((k)=><option key={k.key} value={k.key}>{k.label}</option>)}</select></div>:<span style={{color:'var(--ink-soft)',fontSize:12.5}}>—</span>}</td>
          <td><button className="btn ghost" style={{padding:'2px 7px',fontSize:12}} onClick={()=>delRule(L.id)}>حذف</button></td>
        </tr>)}
        {logic.length===0&&<tr><td colSpan={7}><div className="empty"><h3>لا معادلات</h3><p>مثال: الناتج «الإجمالي» = ضرب «الكمية» × «الفئة» بنطاق «كل سطر جدول».</p></div></td></tr>}
      </tbody></table></div>
      <div className="section"><header><h2>الحقول المتاحة</h2></header><div style={{padding:16,display:'flex',flexWrap:'wrap',gap:8}}>{keys.length===0?<span style={{color:'var(--ink-soft)',fontSize:13.5}}>أضف حقولاً في تبويب الأقسام أولاً.</span>:keys.map((k)=><span key={k.key} className="pill" style={{fontSize:12}}>{k.label} <span className="mono" style={{opacity:.6}}>{k.key}</span></span>)}</div></div>
    </>}

    {tab==='meta'&&<div className="section" style={{marginTop:0,padding:18}}>
      <div className="form-grid">
        <div className="field span2"><label>اسم النموذج بالعربية *</label><input value={t.name_ar||''} onChange={(e)=>setT({...t,name_ar:e.target.value})} onBlur={(e)=>save({name_ar:e.target.value})} /></div>
        <div className="field"><label>الاسم بالإنجليزية</label><input dir="ltr" value={t.name_en||''} onChange={(e)=>setT({...t,name_en:e.target.value})} onBlur={(e)=>save({name_en:e.target.value})} /></div>
        <div className="field span2"><label>العنوان الإنجليزي أسفل عنوان المستند</label><input dir="ltr" value={t.title_en||''} onChange={(e)=>setT({...t,title_en:e.target.value})} onBlur={(e)=>save({title_en:e.target.value})} /></div>
        <div className="field"><label>بادئة الترقيم</label><input dir="ltr" value={t.prefix||''} onChange={(e)=>setT({...t,prefix:e.target.value})} onBlur={(e)=>save({prefix:e.target.value.toUpperCase()})} /><span className="hint">مثال CLM ينتج ARK-CLM-2026-0001</span></div>
        <div className="field"><label>التصنيف</label><select value={t.category||'custom'} onChange={(e)=>save({category:e.target.value})}>{Object.entries(DOCUMENT_CATEGORY_META).map(([key,meta])=><option key={key} value={key}>{meta.label}</option>)}</select></div>
        <div className="field span2"><label>يرتبط النموذج بـ</label><div style={{display:'flex',gap:14,flexWrap:'wrap',paddingTop:8}}>{Object.entries({employee:'موظف',project:'مشروع',party:'طرف خارجي',general:'معاملة عامة'}).map(([key,label])=>{const selected=(t.relation_scope||[]).includes(key);return <label key={key} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><input type="checkbox" checked={selected} onChange={(e)=>{const scope=new Set(t.relation_scope||[]);if(e.target.checked)scope.add(key);else scope.delete(key);save({relation_scope:[...scope]});}} /><span>{label}</span></label>;})}</div></div>
        <div className="field span2"><label>النص الافتتاحي الافتراضي</label><textarea rows="2" value={t.intro_text||''} onChange={(e)=>setT({...t,intro_text:e.target.value})} onBlur={(e)=>save({intro_text:e.target.value})} /></div>
        <div className="field span2"><label>النص الختامي الافتراضي</label><textarea rows="2" value={t.closing_text||''} onChange={(e)=>setT({...t,closing_text:e.target.value})} onBlur={(e)=>save({closing_text:e.target.value})} /></div>
      </div>
      <fieldset>
        <legend>محتوى الطباعة</legend>
        <div style={{display:'flex',gap:22,flexWrap:'wrap',marginBottom:12}}>{[['show_stamp','إظهار الختم'],['show_bank','إظهار الحساب البنكي']].map(([k,label])=><label key={k} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={!!t[k]} onChange={(e)=>save({[k]:e.target.checked})} /><span style={{fontSize:14}}>{label}</span></label>)}</div>
        <div className="hint">القالب يحدد المحتوى فقط. اتجاه الورقة والهوامش والليترهيد وأحجام الشبكة تُضبط من القبطان للطباعة.</div>
      </fieldset>
      <div className="msg err" style={{marginTop:8}}>حذف النموذج لا يُتاح من هنا لأن مستندات صادرة قد تعتمد عليه. لإيقافه عن الاستخدام اجعله غير نشط لاحقاً أو توقّف عن اختياره.</div>
    </div>}
  </>;
}
