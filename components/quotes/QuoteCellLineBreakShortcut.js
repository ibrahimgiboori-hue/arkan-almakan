'use client';

import { useEffect } from 'react';

const isQuoteDescription = (target) => (
  target instanceof HTMLTextAreaElement
  && target.closest('table')
  && target.getAttribute('placeholder') === 'وصف البند'
);

function normalizeBreakShortcut(value) {
  return String(value || '')
    .replace(/\s*&\s*(?:\r?\n)?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function setNativeValue(target, value, caret) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
  if (Number.isFinite(caret)) {
    try { target.setSelectionRange(caret, caret); } catch {}
  }
  target.dispatchEvent(new Event('input', { bubbles:true }));
}

/**
 * Shortcut خاص بخلايا وصف بنود عرض السعر فقط:
 * أي علامة & تُحوَّل إلى سطر جديد داخل نفس الخلية.
 * لا تنشئ بنداً جديداً ولا تغيّر الكمية أو السعر أو أي بيانات مالية.
 */
export default function QuoteCellLineBreakShortcut() {
  useEffect(() => {
    let internal = false;

    function onBeforeInput(event) {
      const target = event.target;
      if (!isQuoteDescription(target)) return;
      if (event.inputType !== 'insertText' || event.data !== '&') return;

      event.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const next = `${target.value.slice(0, start)}\n${target.value.slice(end)}`;
      internal = true;
      setNativeValue(target, next, start + 1);
      internal = false;
    }

    function onPaste(event) {
      const target = event.target;
      if (!isQuoteDescription(target)) return;
      const pasted = event.clipboardData?.getData('text');
      if (!pasted?.includes('&')) return;

      event.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const cleaned = normalizeBreakShortcut(pasted);
      const next = `${target.value.slice(0, start)}${cleaned}${target.value.slice(end)}`;
      internal = true;
      setNativeValue(target, next, start + cleaned.length);
      internal = false;
    }

    function onInput(event) {
      if (internal) return;
      const target = event.target;
      if (!isQuoteDescription(target) || !target.value.includes('&')) return;

      const current = target.value;
      const caret = target.selectionStart ?? current.length;
      const before = normalizeBreakShortcut(current.slice(0, caret));
      const next = normalizeBreakShortcut(current);
      internal = true;
      setNativeValue(target, next, before.length);
      internal = false;
    }

    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('input', onInput, false);
    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('input', onInput, false);
    };
  }, []);

  return null;
}
