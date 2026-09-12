'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { money } from '@/lib/format';
import { numberLines, lineTotal, titleSubtotals, totals, VAT_AR, QSTATUS_AR } from '@/lib/quote-calc';
import { useLiveRefresh } from '@/lib/live';
import {
  QUOTE_EDITOR_TOGGLES as TOGGLES,
  QUOTE_EDITOR_SECTIONS as SECTIONS,
} from '@/lib/quote-editor.mjs';
import { quoteEditorService } from '@/lib/application/quote-editor-service';
import QuotePartyGovernancePanel from '@/components/quotes/QuotePartyGovernancePanel';

export default function QuoteEditor() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  const [items, setItems] = useState([]);
  const [presets, setPresets] = useState([]);
  const [tab, setTab] = useState('lines');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const workspace = await quoteEditorService.loadWorkspace({ quoteId:id });
      setQ(workspace.quote);
      setLines(workspace.lines);
      setPays(workspace.payments);
      setItems(workspace.workItems);
      setPresets(workspace.presets);
    } catch (error) {
      setErr(error?.message || 'تعذّر تحميل عرض السعر.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['quote']);

  const flash = (m) => { setSaved(m); setTimeout(()=>setSaved(''), 1600); };

  async function patch(fields) {
    const previous = q;
    setQ((current) => current ? { ...current, ...fields } : current);
    setErr('');
    try {
      const server = await quoteEditorService.patchQuote({ quoteId:id, fields });
      if (server) setQ((current) => current ? { ...current, ...server } : server);
      flash('حُفظ');
      return true;
    } catch (error) {
      setQ(previous);
      setErr('تعذّر الحفظ: ' + (error?.message || error));
      await load();
      return false;
    }
  }

  async function applyPreset(p) {
    const ok = await patch(p.switches || {});
    if (ok) flash('طُبّق قالب: ' + p.name_ar);
  }

  async function addLine(kind) {
    setErr('');
    try {
      const data = await quoteEditorService.addLine({ quoteId:id, kind });
      setLines((current) => [...current, data].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)));
    } catch (error) {
      setErr('تعذّر الإضافة: ' + (error?.message || error));
    }
  }

  async function insertAfter(afterOrder, kind) {
    setErr('');
    try {
      const next = await quoteEditorService.insertAfter({ quoteId:id, afterOrder, kind });
      setLines(next);
    } catch (error) {
      setErr('تعذّر الإدراج: ' + (error?.message || error));
    }
  }

  function editLine(lineId, fields) {
    setLines((current) => current.map((l) => l.id === lineId ? { ...l, ...fields } : l));
  }

  async function saveLine(lineId, fields) {
    setErr('');
    try {
      const server = await quoteEditorService.saveLine({ quoteId:id, lineId, fields });
      setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...server } : line));
      flash('حُفظ');
      return server;
    } catch (error) {
      setErr('تعذّر الحفظ: ' + (error?.message || error));
      await load();
      return null;
    }
  }

  async function updLine(lineId, fields) {
    editLine(lineId, fields);
    await saveLine(lineId, fields);
  }

  async function delLine(lineId) {
    setErr('');
    try {
      await quoteEditorService.deleteLine({ quoteId:id, lineId });
      setLines((current) => current.filter((l) => l.id !== lineId));
    } catch (error) {
      setErr('تعذّر الحذف: ' + (error?.message || error));
    }
  }

  async function move(lineId, dir) {
    setErr('');
    try {
      const next = await quoteEditorService.moveLine({ quoteId:id, lineId, direction:dir });
      setLines(next);
    } catch (error) {
      setErr('تعذّر تغيير الترتيب: ' + (error?.message || error));
      await load();
    }
  }

  async function pickItem(lineId, wid) {
    if (!wid) return;
    setErr('');
    try {
      const result = await quoteEditorService.pickWorkItem({ quoteId:id, lineId, workItemId:wid });
      setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...result.line } : line));
      setItems((current) => current.map((item) => item.id === wid ? { ...item, use_count:Number(item.use_count || 0)+1 } : item));
      if (result.usageWarning) setErr(result.usageWarning);
      else flash('حُفظ');
    } catch (error) {
      setErr('تعذّر تطبيق بند الدليل: ' + (error?.message || error));
      await load();
    }
  }

  async function saveToLibrary(line) {
    setErr('');
    try {
      await quoteEditorService.saveLineToLibrary({ line });
      flash('أُضيف إلى دليل البنود');
      await load();
    } catch (error) {
      setErr('تعذّر الإضافة للمكتبة: ' + (error?.message || error));
    }
  }

  async function addPay() {
    setErr('');
    try {
      const data = await quoteEditorService.addPayment({ quoteId:id });
      setPays((current) => [...current, data].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)));
    } catch (error) {
      setErr('تعذّر إضافة الدفعة: ' + (error?.message || error));
    }
  }

  async function updPay(pid, fields) {
    setPays((current) => current.map((p) => p.id === pid ? { ...p, ...fields } : p));
    setErr('');
    try {
      const server = await quoteEditorService.updatePayment({ quoteId:id, paymentId:pid, fields });
      setPays((current) => current.map((p) => p.id === pid ? { ...p, ...server } : p));
    } catch (error) {
      setErr('تعذّر حفظ الدفعة: ' + (error?.message || error));
      await load();
    }
  }

  async function delPay(pid) {
    setErr('');
    try {
      await quoteEditorService.deletePayment({ quoteId:id, paymentId:pid });
      setPays((current) => current.filter((p) => p.id !== pid));
    } catch (error) {
      setErr('تعذّر حذف الدفعة: ' + (error?.message || error));
    }
  }

  if (err && !q) return <div className="msg err">{err}</div>;
  if (!q) return <div className="empty">جارٍ التحميل…</div>;

  const numbered = numberLines(lines);
  const subs = titleSubtotals(lines, q.show_qty);
  const t = totals(q, lines);
  const rateOnly = !q.show_qty;
  const showTotalCol = q.show_line_total && !rateOnly;
  const payPctSum = pays.reduce((s,p)=>s+Number(p.percent||0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{q.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'} <span className="mono" style={{fontSize:16,color:'var(--ink-soft)'}}>{q.quote_no}</span></h1>
          <p>{q.client_name} — {VAT_AR[q.vat_mode]}</p>
        </div>
        <div className="rowsplit">
          <Link className="btn" href={`/print/quote/${id}`} target="_blank">معاينة وطباعة</Link>
          <Link className="btn ghost" href="/dashboard/quotes">السجل</Link>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {saved && <div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

      <div className="tabs">
        {[['lines','البنود'],['setup','بيانات العرض'],['switches','المفاتيح'],['pay','الدفعات'],['texts','النصوص']]
          .map(([k,l]) => <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}
      </div>

      {tab === 'lines' && (
        <>
          <div className="rowsplit stickybar">
            <button className="btn" onClick={()=>addLine('item')}>+ بند في النهاية</button>
            <button className="btn ghost" onClick={()=>addLine('title')}>+ عنوان قسم</button>
            <span className="spacer" />
            <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>{lines.length} سطراً · زر <b>+</b> في كل سطر يُدرج بعده مباشرة</span>
          </div>

          <div className="section" style={{marginTop:0,overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th style={{width:64}}>م</th><th>بيان الأعمال</th>
                {q.show_unit && <th style={{width:80}}>الوحدة</th>}
                {q.show_qty && <th style={{width:100}} className="num">الكمية</th>}
                {q.show_unit_price && <th style={{width:110}} className="num">الفئة</th>}
                {showTotalCol && <th style={{width:120}} className="num">الإجمالي</th>}
                <th style={{width:150}}>ترتيب / حذف</th>
              </tr></thead>
              <tbody>
                {numbered.map((l) => l.kind === 'title' ? (
                  <tr key={l.id} style={{background:'var(--rose-wash)'}}>
                    <td className="mono" style={{fontWeight:700,color:'var(--maroon-dark)'}}>{l.number}</td>
                    <td colSpan={1 + (q.show_unit?1:0) + (q.show_qty?1:0) + (q.show_unit_price?1:0)}>
                      <input value={l.description_ar || ''} placeholder="عنوان القسم"
                        onChange={(e)=>editLine(l.id,{description_ar:e.target.value})}
                        onBlur={(e)=>saveLine(l.id,{description_ar:e.target.value})}
                        style={{width:'100%',fontWeight:600,color:'var(--maroon-dark)',border:'none',background:'transparent',fontSize:14.5,fontFamily:'inherit'}} />
                    </td>
                    {showTotalCol && <td className="num" style={{fontWeight:700,color:'var(--maroon-dark)'}}>{money(subs[l.id] || 0)}</td>}
                    <td><div className="rowsplit">
                      <button className="btn" style={{padding:'3px 8px',fontSize:12}} title="إدراج بند بعده" onClick={()=>insertAfter(l.sort_order,'item')}>+</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} title="إدراج عنوان بعده" onClick={()=>insertAfter(l.sort_order,'title')}>+ع</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>move(l.id,-1)}>▲</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>move(l.id,1)}>▼</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>delLine(l.id)}>حذف</button>
                    </div></td>
                  </tr>
                ) : (
                  <tr key={l.id}>
                    <td className="mono">{l.number}</td>
                    <td>
                      <textarea rows="2" value={l.description_ar || ''} placeholder="وصف البند"
                        onChange={(e)=>editLine(l.id,{description_ar:e.target.value})}
                        onBlur={(e)=>saveLine(l.id,{description_ar:e.target.value})}
                        style={{width:'100%',border:'1px solid var(--hair)',fontFamily:'inherit',fontSize:13.5,padding:'4px 6px',resize:'vertical'}} />
                      {q.show_en_desc && <input dir="ltr" value={l.description_en || ''} placeholder="English description"
                        onChange={(e)=>editLine(l.id,{description_en:e.target.value})}
                        onBlur={(e)=>saveLine(l.id,{description_en:e.target.value})}
                        style={{width:'100%',border:'1px solid var(--hair)',fontSize:12.5,padding:'3px 6px',marginTop:3,fontFamily:'inherit'}} />}
                      <div className="rowsplit" style={{marginTop:4}}>
                        {items.length > 0 && <select defaultValue="" onChange={(e)=>pickItem(l.id, e.target.value)} style={{fontSize:12,padding:'2px 4px',maxWidth:180}}>
                          <option value="">من دليل البنود…</option>{items.map((w)=><option key={w.id} value={w.id}>{w.description_ar?.slice(0,42)}</option>)}
                        </select>}
                        <button className="btn ghost" style={{padding:'2px 7px',fontSize:11.5}} onClick={()=>saveToLibrary(l)}>حفظ في الدليل</button>
                      </div>
                    </td>
                    {q.show_unit && <td><input value={l.unit || ''} onChange={(e)=>updLine(l.id,{unit:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',fontSize:13,padding:'4px'}} /></td>}
                    {q.show_qty && <td><input type="number" step="any" dir="ltr" value={l.qty ?? ''} onChange={(e)=>updLine(l.id,{qty:Number(e.target.value||0)})} style={{width:'100%',border:'1px solid var(--hair)',fontSize:13,padding:'4px',textAlign:'left'}} /></td>}
                    {q.show_unit_price && <td><input type="number" step="0.01" dir="ltr" value={l.unit_price ?? ''} onChange={(e)=>updLine(l.id,{unit_price:Number(e.target.value||0)})} style={{width:'100%',border:'1px solid var(--hair)',fontSize:13,padding:'4px',textAlign:'left'}} /></td>}
                    {showTotalCol && <td className="num">{money(lineTotal(l, q.show_qty))}</td>}
                    <td><div className="rowsplit">
                      <button className="btn" style={{padding:'3px 8px',fontSize:12}} title="إدراج بند بعده" onClick={()=>insertAfter(l.sort_order,'item')}>+</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} title="إدراج عنوان بعده" onClick={()=>insertAfter(l.sort_order,'title')}>+ع</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>move(l.id,-1)}>▲</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>move(l.id,1)}>▼</button>
                      <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}} onClick={()=>delLine(l.id)}>حذف</button>
                    </div></td>
                  </tr>
                ))}
                {lines.length > 0 && <tr className="addrow"><td colSpan={2+(q.show_unit?1:0)+(q.show_qty?1:0)+(q.show_unit_price?1:0)+(showTotalCol?1:0)+1}><div className="rowsplit">
                  <button className="btn" style={{padding:'5px 12px',fontSize:13}} onClick={()=>addLine('item')}>+ بند جديد</button>
                  <button className="btn ghost" style={{padding:'5px 12px',fontSize:13}} onClick={()=>addLine('title')}>+ عنوان قسم</button>
                  <span className="spacer" /><span style={{fontSize:12,color:'var(--ink-soft)'}}>يُضاف في نهاية الجدول</span>
                </div></td></tr>}
                {lines.length === 0 && <tr><td colSpan={8}><div className="empty"><h3>لا بنود</h3><p>أضف بنداً أو عنوان قسم من الأزرار أعلاه.</p></div></td></tr>}
              </tbody>
            </table>
          </div>

          {rateOnly ? <div className="section" style={{marginTop:16,padding:'14px 18px'}}>
            <div style={{fontWeight:600,marginBottom:4}}>عرض مقاطعيات — فئات بلا كميات</div>
            <div style={{fontSize:13,color:'var(--ink-soft)',lineHeight:1.9}}>لا يُعرض إجمالي ولا مجموع ولا تفقيط، لأن جمع فئات وحدات مختلفة لا معنى له. تُحتسب المستحقات على الكميات المنفَّذة فعلاً.<br/>ضريبة القيمة المضافة: {VAT_AR[q.vat_mode]} — تُضاف عند الفوترة على الكميات المنفَّذة.<br/>لإظهار المجاميع: فعّل «عمود الكمية» من تبويب المفاتيح.</div>
          </div> : <div className="grid k4" style={{marginTop:16}}>
            <div className="card"><h3>مجموع البنود</h3><div className="big">{money(t.linesSum)}</div></div>
            <div className="card"><h3>الخصم</h3><div className="big">{money(t.discount)}</div></div>
            <div className="card"><h3>ضريبة القيمة المضافة</h3><div className="big">{money(t.vat)}</div><div className="foot">{VAT_AR[q.vat_mode]}</div></div>
            <div className="card"><h3>المجموع شامل الضريبة</h3><div className="big" style={{color:'var(--maroon)'}}>{money(t.grand)}</div></div>
          </div>}
        </>
      )}

      {tab === 'setup' && <>
        <div className="section" style={{marginTop:0,padding:18}}><div className="form-grid">
          <div className="field span2"><label>العميل *</label><input value={q.client_name || ''} onChange={(e)=>setQ({...q,client_name:e.target.value})} onBlur={(e)=>patch({client_name:e.target.value})} /></div>
          <div className="field"><label>جهة الاتصال</label><input value={q.client_contact || ''} onChange={(e)=>setQ({...q,client_contact:e.target.value})} onBlur={(e)=>patch({client_contact:e.target.value})} /></div>
          <div className="field span2"><label>المرجع وتفاصيل المشروع</label><input value={q.project_ref || ''} onChange={(e)=>setQ({...q,project_ref:e.target.value})} onBlur={(e)=>patch({project_ref:e.target.value})} /></div>
          <div className="field"><label>الموقع</label><input value={q.site_location || ''} onChange={(e)=>setQ({...q,site_location:e.target.value})} onBlur={(e)=>patch({site_location:e.target.value})} /></div>
          <div className="field"><label>التاريخ</label><input type="date" dir="ltr" value={q.quote_date || ''} onChange={(e)=>patch({quote_date:e.target.value})} /></div>
          <div className="field">
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:q.show_validity?8:0}}><input type="checkbox" checked={!!q.show_validity} onChange={(e)=>patch({show_validity:e.target.checked})} /><span>إظهار صلاحية العرض</span></label>
            {q.show_validity && <><label>مدة الصلاحية (يوم)</label><input type="number" min="1" dir="ltr" value={q.valid_days ?? 30} onChange={(e)=>setQ({...q,valid_days:e.target.value})} onBlur={(e)=>patch({valid_days:Math.max(1,Number(e.target.value||30))})} /></>}
          </div>
          <div className="field"><label>الحالة</label><select value={q.status} onChange={(e)=>patch({status:e.target.value})}>{Object.entries(QSTATUS_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>معالجة الضريبة</label><select value={q.vat_mode} onChange={(e)=>patch({vat_mode:e.target.value})}><option value="exclusive">تُضاف على الأسعار (١٥٪)</option><option value="inclusive">الأسعار شاملة الضريبة</option><option value="none">بلا ضريبة</option></select></div>
          <div className="field"><label>خصم نسبة (٠.٠٥ = ٥٪)</label><input type="number" step="0.01" dir="ltr" value={q.discount_pct} onChange={(e)=>setQ({...q,discount_pct:e.target.value})} onBlur={(e)=>patch({discount_pct:Number(e.target.value||0)})} /></div>
          <div className="field"><label>خصم مبلغ ثابت</label><input type="number" step="0.01" dir="ltr" value={q.discount_amount} onChange={(e)=>setQ({...q,discount_amount:e.target.value})} onBlur={(e)=>patch({discount_amount:Number(e.target.value||0)})} /></div>
          <div className="field span2"><label>عنوان مخصص للمستند</label><input value={q.title_override || ''} placeholder="اتركه فارغاً للعنوان الافتراضي" onChange={(e)=>setQ({...q,title_override:e.target.value})} onBlur={(e)=>patch({title_override:e.target.value})} /></div>
        </div></div>
        <QuotePartyGovernancePanel quoteId={id} />
      </>}

      {tab === 'switches' && <>
        <div className="section" style={{marginTop:0,marginBottom:16}}>
          <header><h2>قوالب جاهزة</h2></header>
          <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(215px,1fr))',gap:10}}>
            {presets.map((p)=><button key={p.id} onClick={()=>applyPreset(p)} style={{textAlign:'right',background:'#fff',border:'1px solid var(--hair-strong)',padding:'11px 13px',cursor:'pointer',fontFamily:'inherit'}}>
              <div style={{fontSize:14.5,color:'var(--maroon-dark)',fontWeight:600}}>{p.name_ar}</div><div style={{fontSize:12,color:'var(--ink-soft)',marginTop:3,lineHeight:1.5}}>{p.description}</div>
            </button>)}
          </div>
          <div className="hint" style={{padding:'0 16px 14px'}}>القالب يضبط مفاتيح المحتوى دفعة واحدة — هندسة الورقة لا تأتي من قالب عرض السعر</div>
        </div>
        <div className="grid k2">
          <div className="section" style={{marginTop:0}}><header><h2>أعمدة الجدول</h2></header><div style={{padding:'12px 18px'}}>
            {TOGGLES.map(([k,label])=><label key={k} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',cursor:'pointer'}}><input type="checkbox" checked={!!q[k]} onChange={(e)=>patch({[k]:e.target.checked})} /><span style={{fontSize:14}}>{label}</span></label>)}
            <div className="hint" style={{marginTop:8}}>أخفِ الكمية والإجمالي فيخرج العرض مقطوعيات — وأظهرهما فيخرج جدول كميات</div>
          </div></div>
          <div className="section" style={{marginTop:0}}><header><h2>أقسام المستند</h2></header><div style={{padding:'12px 18px'}}>
            {SECTIONS.map(([k,label])=><label key={k} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',cursor:'pointer'}}><input type="checkbox" checked={!!q[k]} onChange={(e)=>patch({[k]:e.target.checked})} /><span style={{fontSize:14}}>{label}</span></label>)}
            <div className="hint" style={{marginTop:8}}>اتجاه الورقة، الليترهيد، الهوامش، أحجام الأعمدة والصفوف تُضبط من القبطان في المعاينة.</div>
          </div></div>
        </div>
      </>}

      {tab === 'pay' && <>
        {rateOnly && <div style={{fontSize:12.5,color:'var(--ink-soft)',marginBottom:8}}>عرض مقاطعيات — النسب فقط، فالمبالغ تُحتسب من الكميات المنفَّذة عند كل مستخلص</div>}
        <div className="rowsplit" style={{marginBottom:12}}><button className="btn" onClick={addPay}>+ دفعة</button><span className="spacer" /><span style={{fontSize:13,color:payPctSum===100?'var(--ok)':'var(--warn)'}}>مجموع النسب: {payPctSum}% {payPctSum===100?'✓':'— يجب أن يساوي ١٠٠٪'}</span></div>
        <div className="section" style={{marginTop:0}}><table>
          <thead><tr><th style={{width:200}}>الدفعة</th><th style={{width:110}} className="num">النسبة %</th>{!rateOnly&&<th className="num" style={{width:140}}>المبلغ</th>}<th>الاستحقاق</th><th style={{width:80}}>—</th></tr></thead>
          <tbody>
            {pays.map((p)=><tr key={p.id}>
              <td><input value={p.label || ''} onChange={(e)=>updPay(p.id,{label:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',fontSize:13.5,fontFamily:'inherit'}} /></td>
              <td><input type="number" step="0.01" dir="ltr" value={p.percent ?? ''} onChange={(e)=>updPay(p.id,{percent:Number(e.target.value||0)})} style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',textAlign:'left'}} /></td>
              {!rateOnly&&<td className="num">{money((t.grand*Number(p.percent||0))/100)}</td>}
              <td><input value={p.trigger_note || ''} placeholder="مثال: عند توقيع العقد" onChange={(e)=>updPay(p.id,{trigger_note:e.target.value})} style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',fontSize:13.5,fontFamily:'inherit'}} /></td>
              <td><button className="btn ghost" style={{padding:'3px 9px',fontSize:12}} onClick={()=>delPay(p.id)}>حذف</button></td>
            </tr>)}
            {pays.length===0&&<tr><td colSpan={5}><div className="empty"><h3>لا دفعات</h3><p>أضف الدفعات المقترحة، والمبالغ تُحسب من المجموع تلقائياً.</p></div></td></tr>}
          </tbody>
        </table></div>
      </>}

      {tab === 'texts' && <div className="section" style={{marginTop:0,padding:18}}>
        <div className="field"><label>النص الافتتاحي (قبل الجدول)</label><textarea rows="3" value={q.intro_text || ''} onChange={(e)=>setQ({...q,intro_text:e.target.value})} onBlur={(e)=>patch({intro_text:e.target.value})} /></div>
        <div className="field"><label>الشروط والأحكام — كل شرط في سطر</label><textarea rows="8" value={q.terms_text || ''} onChange={(e)=>setQ({...q,terms_text:e.target.value})} onBlur={(e)=>patch({terms_text:e.target.value})} /><span className="hint">يُرقّمها النظام تلقائياً ١، ٢، ٣ … فلا تكتب الأرقام</span></div>
        <div className="field"><label>النص الختامي (بعد الجدول)</label><textarea rows="2" value={q.closing_text || ''} onChange={(e)=>setQ({...q,closing_text:e.target.value})} onBlur={(e)=>patch({closing_text:e.target.value})} /></div>
      </div>}
    </>
  );
}
