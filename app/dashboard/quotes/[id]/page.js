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
import WorkbookModelPreview from '@/components/quotes/WorkbookModelPreview';

function pickWorkbookModel(schema, quote) {
  const models = Array.isArray(schema?.models) ? schema.models : [];
  if (!models.length || !quote) return null;
  if (quote.print_model_sheet) {
    const exact = models.find((model) => model.name === quote.print_model_sheet);
    if (exact) return exact;
  }
  const wantsQty = Boolean(quote.show_qty);
  const wantsVat = quote.vat_mode !== 'none';
  return models.find((model) => Boolean(model.hasQty) === wantsQty && Boolean(model.hasVat) === wantsVat) || models[0];
}

function workbookLabel(schema, model, code, fallback) {
  const visible = model?.tokenLabels?.[code];
  if (visible && !String(visible).includes('{{')) return visible;
  const variable = (schema?.variables || []).find((item) => item.code === code);
  return variable?.labelAr || fallback;
}

export default function QuoteEditor() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  const [items, setItems] = useState([]);
  const [presets, setPresets] = useState([]);
  const [printSchema, setPrintSchema] = useState(null);
  const [tab, setTab] = useState('model');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [workspace, familyResult] = await Promise.all([
        quoteEditorService.loadWorkspace({ quoteId:id }),
        quoteEditorService.loadPrintFamilySchema({ familyId:'quotations' }),
      ]);
      setQ(workspace.quote);
      setLines(workspace.lines);
      setPays(workspace.payments);
      setItems(workspace.workItems);
      setPresets(workspace.presets);
      setPrintSchema(familyResult?.ui_schema || null);
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

  async function selectWorkbookModel(name) {
    const model = (printSchema?.models || []).find((item) => item.name === name);
    if (!model) return;
    const fields = { print_model_sheet:name, show_qty:Boolean(model.hasQty) };
    if (model.hasVat && q.vat_mode === 'none') fields.vat_mode = 'exclusive';
    if (!model.hasVat) fields.vat_mode = 'none';
    const ok = await patch(fields);
    if (ok) flash('تم تطبيق نموذج Excel: ' + name);
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
  const activeModel = pickWorkbookModel(printSchema, q);
  const label = (code, fallback) => workbookLabel(printSchema, activeModel, code, fallback);
  const workbookModels = Array.isArray(printSchema?.models) ? printSchema.models : [];
  const workbookVisibility = Array.isArray(printSchema?.visibility) ? printSchema.visibility : [];
  const previewToggles = Object.fromEntries(workbookVisibility.map((rule) => [
    rule.toggle,
    q?.[rule.toggle] ?? rule.defaultValue,
  ]));
  const previewRepeatGroups = {
    line_items:numbered
      .filter((line) => line.kind !== 'title')
      .map((line) => ({
        item_no:line.number,
        description_ar:line.description_ar || '',
        description_en:line.description_en || '',
        unit:line.unit || '',
        qty:line.qty ?? '',
        unit_price:line.unit_price ?? '',
        line_total:lineTotal(line, q.show_qty),
      })),
    payment_terms:pays.map((payment, index) => ({
      payment_terms:`${payment.label || `الدفعة ${index + 1}`}: ${Number(payment.percent || 0)}%${payment.trigger_note ? ` — ${payment.trigger_note}` : ''}`,
    })),
    terms:String(q.terms_text || '').split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ terms:text })),
  };
  const previewRepeatData = {
    line_items:numbered.map((line) => ({
      item_no:line.number || '',
      description_ar:line.description_ar || '',
      description_en:line.description_en || '',
      unit:line.kind === 'title' ? '' : (line.unit || ''),
      qty:line.kind === 'title' ? '' : (line.qty ?? ''),
      unit_price:line.kind === 'title' ? '' : money(Number(line.unit_price || 0)),
      line_total:line.kind === 'title'
        ? (showTotalCol ? money(Number(subs[line.id] || 0)) : '')
        : (showTotalCol ? money(lineTotal(line, q.show_qty)) : ''),
    })),
    payment_terms:pays.map((payment, index) => ({
      payment_terms:`${payment.label || `الدفعة ${index + 1}`}${Number(payment.percent || 0) ? ` — ${Number(payment.percent || 0)}%` : ''}${payment.trigger_note ? ` — ${payment.trigger_note}` : ''}`,
    })),
    terms:String(q.terms_text || '').split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ terms:text })),
  };

  const previewValues = {
    quote_no:q.quote_no,
    quote_date:q.quote_date,
    client_name:q.client_name,
    client_contact:q.client_contact,
    project_ref:q.project_ref,
    site_location:q.site_location,
    valid_days:q.valid_days,
    intro_text:q.intro_text,
    subtotal:t.subtotal,
    vat_rate:Number(q.vat_rate || 0) * 100 + '%',
    vat_amount:t.vat,
    grand_total:t.grand,
    plain_total:t.grand,
    item_no:numbered[0]?.number || 1,
    description_ar:numbered[0]?.description_ar || label('description_ar','بيان الأعمال'),
    description_en:numbered[0]?.description_en || '',
    unit:numbered[0]?.unit || '',
    qty:numbered[0]?.qty ?? '',
    unit_price:numbered[0]?.unit_price ?? '',
    line_total:numbered[0] ? lineTotal(numbered[0], q.show_qty) : '',
    representative_name:q.arkan_signatory_name || '',
    representative_title:q.arkan_signatory_title || '',
    bank_name:'مصرف الراجحي',
    bank_account_no:'',
    bank_iban:'',
    payment_terms:pays.length ? `${pays.length} دفعات` : label('payment_terms','شروط الدفع'),
    terms:q.terms_text || label('terms','الشروط والأحكام'),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{activeModel?.name || (q.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر')} <span className="mono" style={{fontSize:16,color:'var(--ink-soft)'}}>{q.quote_no}</span></h1>
          <p>{q.client_name} — {VAT_AR[q.vat_mode]}</p>
          {workbookModels.length ? <div style={{marginTop:8,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>نموذج Excel:</span>
            <select value={activeModel?.name || ''} onChange={(e)=>selectWorkbookModel(e.target.value)} style={{maxWidth:360}}>
              {workbookModels.map((model)=><option key={model.name} value={model.name}>{model.name}</option>)}
            </select>
            <span className="pill">الواجهة مرتبطة بالإصدار المرفوع</span>
          </div> : null}
        </div>
        <div className="rowsplit">
          <Link className="btn" href={`/dashboard/quotes/${id}/workbook-print`} target="_blank">معاينة وطباعة Excel</Link>
          <Link className="btn ghost" href="/dashboard/quotes">السجل</Link>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {saved && <div className="msg ok" style={{marginBottom:12}}>{saved}</div>}

      <div className="tabs">
        {[['model','تصميم Excel'],['lines',label('line_items','البنود')],['setup','بيانات العرض'],['switches','المفاتيح'],['pay',label('payment_terms','الدفعات')],['texts',label('terms','النصوص')]]
          .map(([k,l]) => <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}
      </div>

      {tab === 'model' && (
        <div className="section" style={{marginTop:0}}>
          <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div>
              <h2 style={{margin:0}}>{activeModel?.name || 'تصميم Excel'}</h2>
              <div className="hint">هذا العرض يُبنى من هندسة الـSheet المرفوع: مواقع العناصر والدمج وأسماء الحقول تتغير عند إعادة رفع ملف Excel.</div>
            </div>
            <span className="pill">{activeModel?.cells?.length || 0} عنصر مقروء</span>
          </header>
          <WorkbookModelPreview
            model={activeModel}
            values={previewValues}
            variables={printSchema?.variables || []}
            visibility={workbookVisibility}
            toggles={previewToggles}
            repeatGroups={previewRepeatGroups}
            overlays={printSchema?.overlays || []}
          />
        </div>
      )}

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
                <th style={{width:64}}>{label('item_no','م')}</th><th>{label('description_ar','بيان الأعمال')}</th>
                {q.show_unit && <th style={{width:80}}>{label('unit','الوحدة')}</th>}
                {q.show_qty && <th style={{width:100}} className="num">{label('qty','الكمية')}</th>}
                {q.show_unit_price && <th style={{width:110}} className="num">{label('unit_price','الفئة')}</th>}
                {showTotalCol && <th style={{width:120}} className="num">{label('line_total','الإجمالي')}</th>}
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
            <div className="card"><h3>{label('vat_amount','ضريبة القيمة المضافة')}</h3><div className="big">{money(t.vat)}</div><div className="foot">{VAT_AR[q.vat_mode]}</div></div>
            <div className="card"><h3>{q.vat_mode === 'none' ? label('plain_total','الإجمالي الكلي') : label('grand_total','الإجمالي الكلي')}</h3><div className="big" style={{color:'var(--maroon)'}}>{money(t.grand)}</div></div>
          </div>}
        </>
      )}

      {tab === 'setup' && <>
        <div className="section" style={{marginTop:0,padding:18}}><div className="form-grid">
          <div className="field span2"><label>{label('client_name','العميل')} *</label><input value={q.client_name || ''} onChange={(e)=>setQ({...q,client_name:e.target.value})} onBlur={(e)=>patch({client_name:e.target.value})} /></div>
          <div className="field"><label>{label('client_contact','جهة الاتصال')}</label><input value={q.client_contact || ''} onChange={(e)=>setQ({...q,client_contact:e.target.value})} onBlur={(e)=>patch({client_contact:e.target.value})} /></div>
          <div className="field span2"><label>{label('project_ref','المرجع وتفاصيل المشروع')}</label><input value={q.project_ref || ''} onChange={(e)=>setQ({...q,project_ref:e.target.value})} onBlur={(e)=>patch({project_ref:e.target.value})} /></div>
          <div className="field"><label>{label('site_location','الموقع')}</label><input value={q.site_location || ''} onChange={(e)=>setQ({...q,site_location:e.target.value})} onBlur={(e)=>patch({site_location:e.target.value})} /></div>
          <div className="field"><label>{label('quote_date','التاريخ')}</label><input type="date" dir="ltr" value={q.quote_date || ''} onChange={(e)=>patch({quote_date:e.target.value})} /></div>
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
          <header>
            <h2>نماذج Excel المعتمدة</h2>
            <div className="hint">هذه القائمة تأتي مباشرة من أسماء الـSheets داخل ملف عائلة عروض الأسعار المرفوع.</div>
          </header>
          <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:10}}>
            {workbookModels.map((model)=>{
              const active = activeModel?.name === model.name;
              return <button key={model.name} onClick={()=>selectWorkbookModel(model.name)} style={{
                textAlign:'right',
                background:active?'var(--rose-wash)':'#fff',
                border:active?'2px solid var(--maroon)':'1px solid var(--hair-strong)',
                padding:'12px 14px',
                cursor:'pointer',
                fontFamily:'inherit',
                borderRadius:8,
              }}>
                <div style={{fontSize:14.5,color:'var(--maroon-dark)',fontWeight:700}}>{model.name}</div>
                <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:4,lineHeight:1.6}}>
                  {model.hasQty?'جدول كميات':'مقطوعية'} · {model.hasVat?'بضريبة':'بدون ضريبة'} · {model.cells?.length || 0} عنصر مقروء
                </div>
                {active ? <div style={{marginTop:8,fontSize:12,fontWeight:700,color:'var(--maroon)'}}>النموذج الحالي ✓</div> : null}
              </button>;
            })}
          </div>
          {!workbookModels.length ? <div className="empty" style={{margin:16}}><h3>لا توجد نماذج Excel مقروءة</h3><p>أعد رفع ملف عائلة عروض الأسعار من الإعدادات.</p></div> : null}
        </div>

        <div className="grid k2">
          <div className="section" style={{marginTop:0}}><header><h2>مفاتيح البيانات</h2></header><div style={{padding:'12px 18px'}}>
            {TOGGLES.map(([k,label])=><label key={k} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',cursor:'pointer'}}><input type="checkbox" checked={!!q[k]} onChange={(e)=>patch({[k]:e.target.checked})} /><span style={{fontSize:14}}>{label}</span></label>)}
            <div className="hint" style={{marginTop:8}}>هذه المفاتيح تؤثر في البيانات فقط. هندسة الورقة وأعمدتها تأتي من نموذج Excel المختار.</div>
          </div></div>
          <div className="section" style={{marginTop:0}}><header><h2>العناصر الاختيارية من Excel</h2></header><div style={{padding:'12px 18px'}}>
            {(workbookVisibility.length ? workbookVisibility : SECTIONS.map(([toggle,label],index)=>({toggle,label,priority:index}))).map((rule)=><label key={rule.toggle} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',cursor:'pointer'}}><input type="checkbox" checked={Boolean(q?.[rule.toggle] ?? rule.defaultValue)} onChange={(e)=>patch({[rule.toggle]:e.target.checked})} /><span style={{fontSize:14}}>{rule.label || rule.toggle}</span><span style={{fontSize:11.5,color:'var(--ink-soft)'}}>{rule.elementType === 'OVERLAY_ASSET' ? 'طبقة حرة' : ''}</span></label>)}
            <div className="hint" style={{marginTop:8}}>هذه القائمة تُقرأ من ورقة _VISIBILITY داخل ملف العائلة. إخفاء عنصر تدفقي يسحب كل ما تحته للأعلى؛ الختم والتوقيع لا يؤثران على التدفق.</div>
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
