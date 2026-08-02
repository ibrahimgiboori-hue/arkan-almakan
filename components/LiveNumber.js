'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/live';

/* حقل رقمي: يحفظ عند الخروج، ويُعلن التغيير، ويعرض حالة الحفظ */
export default function LiveNumber({
  table, id, column, value, scope = 'all',
  step = '0.01', min, disabled, style, onSaved, className,
}) {
  const [v, setV] = useState(value ?? '');
  const [state, setState] = useState('');      // saving | saved | error

  useEffect(() => { setV(value ?? ''); }, [value]);

  async function commit() {
    const num = v === '' ? null : Number(v);
    if (num === (value ?? null)) return;
    setState('saving');
    const res = await db.update(table, { [column]: num }, 'id', id, scope);
    if (res.error) { setState('error'); return; }
    setState('saved');
    onSaved?.(num);
    setTimeout(()=>setState(''), 900);
  }

  return (
    <span className={`live-num ${state}`}>
      <input type="number" step={step} min={min} dir="ltr" disabled={disabled}
             value={v} onChange={(e)=>setV(e.target.value)}
             onBlur={commit}
             onKeyDown={(e)=>{ if (e.key === 'Enter') e.currentTarget.blur(); }}
             style={style} className={className} />
      {state === 'saving' && <i className="lm">…</i>}
      {state === 'saved'  && <i className="lm ok">✓</i>}
      {state === 'error'  && <i className="lm bad">!</i>}
    </span>
  );
}
