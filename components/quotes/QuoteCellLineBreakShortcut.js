'use client';

import { useEffect } from 'react';

/**
 * Shortcut خاص بخلايا وصف بنود عرض السعر فقط:
 * أي علامة & تُحوَّل أثناء الكتابة/اللصق إلى سطر جديد داخل نفس الخلية.
 * لا تنشئ بنداً جديداً ولا تغيّر الكمية أو السعر أو أي بيانات مالية.
 */
export default function QuoteCellLineBreakShortcut() {
  useEffect(() => {
    function onInput(event) {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement)) return;
      if (!target.closest('table')) return;
      if (target.getAttribute('placeholder') !== 'وصف البند') return;
      if (!target.value.includes('&')) return;

      const current = target.value;
      const caret = target.selectionStart ?? current.length;
      const beforeCaret = current.slice(0, caret);
      const next = current.replaceAll('&', '\n');
      const nextCaret = beforeCaret.replaceAll('&', '\n').length;

      target.value = next;
      try { target.setSelectionRange(nextCaret, nextCaret); } catch {}
    }

    // capture=true حتى تصل React للقيمة بعد تحويل & إلى \n وتحفظها مباشرة.
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, []);

  return null;
}
