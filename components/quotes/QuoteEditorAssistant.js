'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const HAS_AR = /[\u0600-\u06FF]/;
const HAS_LATIN = /[A-Za-z]/;

function needsTranslation(text, sourceLanguage) {
  const value = String(text || '').trim();
  if (!value) return false;
  return sourceLanguage === 'ar' ? HAS_AR.test(value) : HAS_LATIN.test(value);
}

export default function QuoteEditorAssistant({ quoteId }) {
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const dirtyNumbers = useRef(new WeakSet());

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('quotations')
      .select('id,quote_no,language,show_en_desc,intro_text,closing_text,terms_text,terms_structured')
      .eq('id', quoteId)
      .maybeSingle();
    if (loadError) setError(loadError.message);
    else setQuote(data || null);
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  // Numeric constitution: do not let React/database rewrite a number after every keystroke.
  // The DOM keeps the raw text while the user is typing, then the existing React handler
  // receives one final input event on focus-out and persists the finished number once.
  useEffect(() => {
    const onInputCapture = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
      if (event.__arkanQuoteCommit) return;
      dirtyNumbers.current.add(input);
      event.stopPropagation();
    };

    const onFocusOutCapture = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
      if (!dirtyNumbers.current.has(input)) return;
      dirtyNumbers.current.delete(input);
      const commit = new Event('input', { bubbles:true, cancelable:false });
      Object.defineProperty(commit, '__arkanQuoteCommit', { value:true });
      input.dispatchEvent(commit);
    };

    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
    return () => {
      document.removeEventListener('input', onInputCapture, true);
      document.removeEventListener('focusout', onFocusOutCapture, true);
    };
  }, []);

  async function setLanguage(language) {
    if (!quote || busy) return;
    setBusy('language'); setError(''); setMessage('');
    const { error: saveError } = await supabase
      .from('quotations')
      .update({ language, show_en_desc: language === 'en' })
      .eq('id', quoteId);
    setBusy('');
    if (saveError) { setError(saveError.message); return; }
    setQuote((previous)=>({ ...previous, language, show_en_desc:language === 'en' }));
    setMessage(language === 'en'
      ? 'لغة المستند: English — الطباعة أصبحت LTR والعناوين النظامية بالإنجليزية.'
      : 'لغة المستند: العربية — الطباعة أصبحت RTL.');
  }

  async function translateText(translator, value, sourceLanguage) {
    if (!needsTranslation(value, sourceLanguage)) return String(value || '');
    return translator.translate(String(value));
  }

  async function translateDocument() {
    if (!quote || busy) return;
    setError(''); setMessage(''); setProgress('');
    const targetLanguage = quote.language === 'en' ? 'en' : 'ar';
    const sourceLanguage = targetLanguage === 'en' ? 'ar' : 'en';

    if (!('Translator' in globalThis)) {
      setError('الترجمة المحلية غير متاحة في هذا المتصفح. استخدم Chrome Desktop حديثًا ثم أعد المحاولة.');
      return;
    }

    setBusy('translate');
    let translator;
    try {
      const availability = await globalThis.Translator.availability({ sourceLanguage, targetLanguage });
      if (availability === 'unavailable') throw new Error('زوج اللغات غير متاح في مترجم المتصفح.');
      translator = await globalThis.Translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            setProgress(`تجهيز الترجمة… ${Math.round(Number(event.loaded || 0) * 100)}%`);
          });
        },
      });

      const [{ data:lines, error:linesError }, { data:pays, error:paysError }] = await Promise.all([
        supabase.from('quotation_lines').select('id,description_ar,description_en').eq('quotation_id', quoteId).order('sort_order'),
        supabase.from('quotation_payments').select('id,label,trigger_note').eq('quotation_id', quoteId).order('sort_order'),
      ]);
      if (linesError) throw linesError;
      if (paysError) throw paysError;

      let done = 0;
      const total = (lines || []).length + (pays || []).length + 3 + (Array.isArray(quote.terms_structured) ? quote.terms_structured.length : 0);
      const tick = () => { done += 1; setProgress(`ترجمة النصوص… ${done}/${Math.max(total,1)}`); };

      for (const line of (lines || [])) {
        if (targetLanguage === 'en') {
          const source = line.description_ar || '';
          const translated = needsTranslation(source, 'ar')
            ? await translateText(translator, source, 'ar')
            : (line.description_en || source);
          if (translated && translated !== line.description_en) {
            const { error:saveError } = await supabase.from('quotation_lines').update({ description_en:translated }).eq('id', line.id);
            if (saveError) throw saveError;
          }
        } else {
          const source = line.description_en || line.description_ar || '';
          const translated = needsTranslation(source, 'en')
            ? await translateText(translator, source, 'en')
            : (line.description_ar || source);
          if (translated && translated !== line.description_ar) {
            const { error:saveError } = await supabase.from('quotation_lines').update({ description_ar:translated }).eq('id', line.id);
            if (saveError) throw saveError;
          }
        }
        tick();
      }

      const quoteFields = {};
      for (const key of ['intro_text','closing_text','terms_text']) {
        const current = quote[key] || '';
        if (needsTranslation(current, sourceLanguage)) quoteFields[key] = await translateText(translator, current, sourceLanguage);
        tick();
      }

      if (Array.isArray(quote.terms_structured) && quote.terms_structured.length) {
        const nextTerms = [];
        for (const term of quote.terms_structured) {
          const title = needsTranslation(term?.title, sourceLanguage)
            ? await translateText(translator, term.title, sourceLanguage) : (term?.title || '');
          const body = needsTranslation(term?.body, sourceLanguage)
            ? await translateText(translator, term.body, sourceLanguage) : (term?.body || '');
          nextTerms.push({ ...term, title, body });
          tick();
        }
        quoteFields.terms_structured = nextTerms;
      }

      if (Object.keys(quoteFields).length) {
        const { error:quoteError } = await supabase.from('quotations').update(quoteFields).eq('id', quoteId);
        if (quoteError) throw quoteError;
      }

      for (const payment of (pays || [])) {
        const fields = {};
        if (needsTranslation(payment.label, sourceLanguage)) fields.label = await translateText(translator, payment.label, sourceLanguage);
        if (needsTranslation(payment.trigger_note, sourceLanguage)) fields.trigger_note = await translateText(translator, payment.trigger_note, sourceLanguage);
        if (Object.keys(fields).length) {
          const { error:payError } = await supabase.from('quotation_payments').update(fields).eq('id', payment.id);
          if (payError) throw payError;
        }
        tick();
      }

      setProgress('');
      setMessage(targetLanguage === 'en'
        ? 'اكتملت ترجمة النصوص العربية إلى الإنجليزية وحُفظت في العرض.'
        : 'اكتملت ترجمة النصوص الإنجليزية إلى العربية وحُفظت في العرض.');
      await load();
      window.setTimeout(()=>window.location.reload(), 350);
    } catch (translationError) {
      setProgress('');
      setError(translationError?.message || 'تعذرت الترجمة.');
    } finally {
      try { translator?.destroy?.(); } catch {}
      setBusy('');
    }
  }

  if (!quote) return null;
  const isEn = quote.language === 'en';

  return (
    <div className="quote-editor-assistant" dir="rtl">
      <div className="quote-editor-assistant-main">
        <strong>لغة عرض السعر</strong>
        <div className="quote-language-switch" role="group" aria-label="لغة عرض السعر">
          <button type="button" className={!isEn ? 'active' : ''} disabled={!!busy} onClick={()=>setLanguage('ar')}>العربية</button>
          <button type="button" className={isEn ? 'active' : ''} disabled={!!busy} onClick={()=>setLanguage('en')}>English</button>
        </div>
        <span className="quote-direction-badge">{isEn ? 'LTR ←' : 'RTL →'}</span>
        <button type="button" className="quote-translate-button" disabled={!!busy} onClick={translateDocument}>
          {busy === 'translate' ? 'جارٍ الترجمة…' : isEn ? 'ترجمة النصوص للإنجليزية' : 'ترجمة النصوص للعربية'}
        </button>
      </div>
      {progress ? <div className="quote-assistant-progress">{progress}</div> : null}
      {message ? <div className="quote-assistant-ok">{message}</div> : null}
      {error ? <div className="quote-assistant-error">{error}</div> : null}
      <style jsx>{`
        .quote-editor-assistant{margin:0 0 14px;border:1px solid #d9cece;background:#fff;border-radius:12px;padding:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
        .quote-editor-assistant-main{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.quote-editor-assistant-main strong{font-size:13px;color:#332f2f}
        .quote-language-switch{display:inline-flex;border:1px solid #bfaeae;border-radius:8px;overflow:hidden}.quote-language-switch button{border:0;border-left:1px solid #d8cccc;background:#fff;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer;color:#463d3d}.quote-language-switch button:last-child{border-left:0}.quote-language-switch button.active{background:#8B3332;color:#fff;font-weight:800}.quote-language-switch button:disabled,.quote-translate-button:disabled{opacity:.55;cursor:wait}
        .quote-direction-badge{font:700 11px/1.2 ui-monospace,monospace;color:#655;padding:4px 7px;background:#f4efef;border-radius:6px}.quote-translate-button{margin-inline-start:auto;border:1px solid #8B3332;background:#fff;color:#7d2929;border-radius:8px;padding:6px 11px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.quote-translate-button:hover{background:#faf0f0}
        .quote-assistant-progress,.quote-assistant-ok,.quote-assistant-error{margin-top:8px;font-size:12px;line-height:1.6}.quote-assistant-progress{color:#6d5c28}.quote-assistant-ok{color:#236542}.quote-assistant-error{color:#a32b24}
      `}</style>
    </div>
  );
}
