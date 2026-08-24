'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function nextNumber(value) {
  const parts = String(value || '1').split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      parts[i] = String(Number(parts[i]) + 1);
      return parts.join('-');
    }
  }
  return `${value}-1`;
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

export default function QuoteTermsEditor() {
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

  async function save(nextItems = items, nextStart = start) {
    const { error } = await supabase.from('quotations').update({
      terms_structured: nextItems,
      terms_start: String(nextStart || '1').trim() || '1',
      show_terms: true,
    }).eq('id', id);
    if (error) setErr(error.message);
    else { setSaved('حُفظت الشروط'); setTimeout(() => setSaved(''), 1400); }
  }

  function patchItem(index, fields) {
    setItems(items.map((x, i) => i === index ? { ...x, ...fields } : x));
  }

  function addAfter(index) {
    const next = [...items]; next.splice(index + 1, 0, newTerm()); setItems(next); save(next);
  }

  function remove(index) {
    const next = items.filter((_, i) => i !== index); setItems(next); save(next);
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; setItems(next); save(next);
  }

  if (err && !q) return <div className="msg err">{err}</div>;
  if (!q) return <div className="empty">جارٍ التحميل…</div>;

  return <>
    <div className="page-head">
      <div>
        <h1>الشروط والأحكام <span className="mono" style={{fontSize:15,color:'var(--ink-soft)'}}>{q.quote_no}</span></h1>
        <p>عنوان مستقل + نص مستقل + ترقيم ذكي قابل للتدخل اليدوي</p>
      </div>
      <div className="rowsplit">
        <Link className="btn" href={`/print/quote/${id}`} target="_blank">معاينة وطباعة</Link>
        <Link className="btn ghost" href={`/dashboard/quotes/${id}`}>العودة للعرض</Link>
      </div>
    </div>
    {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
    {saved && <div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

    <div className="section" style={{padding:18,marginTop:0}}>
      <div className="rowsplit" style={{alignItems:'end',marginBottom:15}}>
        <div className="field" style={{maxWidth:180,margin:0}}>
          <label>بداية الترقيم</label>
          <input dir="ltr" value={start} placeholder="مثال: 2 أو 2-1"
            onChange={e=>setStart(e.target.value)}
            onBlur={e=>save(items,e.target.value)} />
        </div>
        <div className="hint" style={{maxWidth:650}}>
          اترك رقم البند فارغاً ليكمله النظام تلقائياً. إذا كتبت رقماً يدوياً مثل 2-1، يفهم النظام النمط ويجعل التالي 2-2. وإذا غيّرته إلى 3 يصبح التالي 4.
        </div>
      </div>

      {numbered.map((item, index) => (
        <div key={item.id || index} style={{borderBottom:'1px solid var(--hair)',padding:'12px 0'}}>
          <div style={{display:'grid',gridTemplateColumns:'95px minmax(180px,.7fr) minmax(300px,1.8fr) 150px',gap:10,alignItems:'start'}}>
            <div className="field" style={{margin:0}}>
              <label>الرقم</label>
              <input dir="ltr" value={item.number_override ?? ''} placeholder={item.resolved_number}
                onChange={e=>patchItem(index,{number_override:e.target.value || null})}
                onBlur={()=>save()} />
              <span className="hint">الناتج: {item.resolved_number}</span>
            </div>
            <div className="field" style={{margin:0}}>
              <label>عنوان الشرط</label>
              <input value={item.title || ''} placeholder="Advance Payment"
                onChange={e=>patchItem(index,{title:e.target.value})}
                onBlur={()=>save()} />
            </div>
            <div className="field" style={{margin:0}}>
              <label>نص الشرط</label>
              <textarea rows="3" value={item.body || ''} placeholder="نص الشرط..."
                onChange={e=>patchItem(index,{body:e.target.value})}
                onBlur={()=>save()} />
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
      <div style={{marginTop:14}}><button className="btn" onClick={()=>{const next=[...items,newTerm()];setItems(next);save(next)}}>+ إضافة شرط</button></div>
    </div>
  </>;
}
