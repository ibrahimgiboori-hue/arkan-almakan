'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function nextNumber(value) {
  const raw = String(value || '1').trim() || '1';
  const parts = raw.split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      parts[i] = String(Number(parts[i]) + 1);
      return parts.join('-');
    }
  }
  return `${raw}-1`;
}

function resolveNumbers(items, start) {
  let previous = String(start || '1').trim() || '1';
  return items.map((item, index) => {
    const manual = String(item.number_override || '').trim();
    const number = manual || (index === 0 ? previous : nextNumber(previous));
    previous = number;
    return { ...item, resolved_number: number };
  });
}

function newTerm() {
  return { id: crypto.randomUUID(), title: '', body: '', number_override: null };
}

export default function QuoteTextEditor() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [items, setItems] = useState([]);
  const [start, setStart] = useState('1');
  const [saved, setSaved] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();
      if (error || !data) { setErr(error?.message || 'لم يُعثر على عرض السعر'); return; }
      setQ(data);
      setStart(data.terms_start || '1');
      const structured = Array.isArray(data.terms_structured) ? data.terms_structured : [];
      setItems(structured.length ? structured : [newTerm()]);
    })();
  }, [id]);

  const numbered = useMemo(() => resolveNumbers(items, start), [items, start]);

  const flash = (text) => { setSaved(text); setTimeout(() => setSaved(''), 1400); };

  async function patchQuote(fields) {
    setQ((old) => ({ ...old, ...fields }));
    const { error } = await supabase.from('quotations').update(fields).eq('id', id);
    if (error) setErr(error.message); else flash('حُفظ');
  }

  async function saveTerms(nextItems = items, nextStart = start) {
    const { error } = await supabase.from('quotations').update({
      terms_structured: nextItems,
      terms_start: String(nextStart || '1').trim() || '1',
      show_terms: true,
    }).eq('id', id);
    if (error) setErr(error.message); else flash('حُفظت الشروط');
  }

  function patchItem(index, fields) {
    setItems(items.map((x, i) => i === index ? { ...x, ...fields } : x));
  }

  function addAfter(index) {
    const next = [...items];
    next.splice(index + 1, 0, newTerm());
    setItems(next); saveTerms(next);
  }

  function remove(index) {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [newTerm()]);
    saveTerms(next.length ? next : [newTerm()]);
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next); saveTerms(next);
  }

  if (err && !q) return <div className="msg err">{err}</div>;
  if (!q) return <div className="empty">جارٍ التحميل…</div>;

  return <>
    <div className="page-head">
      <div>
        <h1>محرر النصوص <span className="mono" style={{fontSize:15,color:'var(--ink-soft)'}}>{q.quote_no}</span></h1>
        <p>النص الافتتاحي + شروط منظمة + النص الختامي</p>
      </div>
      <div className="rowsplit">
        <Link className="btn" href={`/print/quote/${id}`} target="_blank">معاينة وطباعة</Link>
        <Link className="btn ghost" href={`/dashboard/quotes/${id}`}>العودة للعرض</Link>
      </div>
    </div>

    {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {saved && <div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

    <div className="section" style={{padding:18,marginTop:0,marginBottom:16}}>
      <div className="field" style={{margin:0}}>
        <label>النص الافتتاحي (قبل الجدول)</label>
        <textarea rows="3" value={q.intro_text || ''}
          onChange={(e)=>setQ({...q,intro_text:e.target.value})}
          onBlur={(e)=>patchQuote({intro_text:e.target.value})} />
      </div>
    </div>

    <div className="section" style={{padding:18,marginTop:0,marginBottom:16}}>
      <header style={{padding:0,marginBottom:14}}><h2 style={{margin:0}}>الشروط والأحكام</h2></header>
      <div className="rowsplit" style={{alignItems:'end',marginBottom:15}}>
        <div className="field" style={{maxWidth:180,margin:0}}>
          <label>بداية الترقيم</label>
          <input dir="ltr" value={start} placeholder="مثال: 2 أو 2-1"
            onChange={e=>setStart(e.target.value)}
            onBlur={e=>saveTerms(items,e.target.value)} />
        </div>
        <div className="hint" style={{maxWidth:720,lineHeight:1.7}}>
          اكتب البداية فقط، ثم يكمّل النظام النمط تلقائياً. ويمكنك تعديل رقم أي بند يدوياً؛ مثال: 2 ثم 2-1 فيصبح التالي 2-2، وإذا كتبت 3 يصبح التالي 4.
        </div>
      </div>

      {numbered.map((item, index) => (
        <div key={item.id || index} style={{borderTop:index ? '1px solid var(--hair)' : 'none',padding:'13px 0'}}>
          <div style={{display:'grid',gridTemplateColumns:'90px minmax(190px,.75fr) minmax(330px,1.9fr) 145px',gap:10,alignItems:'start'}}>
            <div className="field" style={{margin:0}}>
              <label>الرقم</label>
              <input dir="ltr" value={item.number_override ?? ''} placeholder={item.resolved_number}
                onChange={e=>patchItem(index,{number_override:e.target.value || null})}
                onBlur={()=>saveTerms()} />
              <span className="hint">{item.resolved_number}</span>
            </div>
            <div className="field" style={{margin:0}}>
              <label>عنوان الشرط</label>
              <input value={item.title || ''} placeholder="مثال: Advance Payment"
                onChange={e=>patchItem(index,{title:e.target.value})}
                onBlur={()=>saveTerms()} />
            </div>
            <div className="field" style={{margin:0}}>
              <label>نص الشرط</label>
              <textarea rows="3" value={item.body || ''} placeholder="اكتب نص الشرط هنا..."
                onChange={e=>patchItem(index,{body:e.target.value})}
                onBlur={()=>saveTerms()} />
            </div>
            <div className="rowsplit" style={{paddingTop:24,flexWrap:'wrap'}}>
              <button className="btn" style={{padding:'4px 8px'}} onClick={()=>addAfter(index)}>+ بعده</button>
              <button className="btn ghost" style={{padding:'4px 8px'}} onClick={()=>move(index,-1)}>▲</button>
              <button className="btn ghost" style={{padding:'4px 8px'}} onClick={()=>move(index,1)}>▼</button>
              <button className="btn ghost" style={{padding:'4px 8px'}} onClick={()=>remove(index)}>حذف</button>
            </div>
          </div>
        </div>
      ))}
      <div style={{marginTop:12}}>
        <button className="btn" onClick={()=>{const next=[...items,newTerm()];setItems(next);saveTerms(next)}}>+ إضافة شرط</button>
      </div>
    </div>

    <div className="section" style={{padding:18,marginTop:0}}>
      <div className="field" style={{margin:0}}>
        <label>النص الختامي (بعد الجدول)</label>
        <textarea rows="3" value={q.closing_text || ''}
          onChange={(e)=>setQ({...q,closing_text:e.target.value})}
          onBlur={(e)=>patchQuote({closing_text:e.target.value})} />
      </div>
    </div>
  </>;
}
