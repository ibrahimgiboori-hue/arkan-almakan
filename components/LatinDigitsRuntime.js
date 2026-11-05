'use client';

import { useEffect } from 'react';
import { hasNonLatinNumerals, latinDigits } from '@/lib/latin-digits';
import { DATE_FIELD_LANG, dateFieldDisplay, isOverlaidDateType } from '@/lib/date-field-display.mjs';

const SKIP_TAGS = new Set(['SCRIPT','STYLE','CODE','PRE']);
const SAFE_TEXT_ATTRIBUTES = ['title','aria-label','placeholder','value'];
const SKIP_INPUT_TYPES = new Set(['password','file']);
const LATIN_NATIVE_INPUT_TYPES = new Set(['number','date','time','datetime-local','month','week','tel']);

// Date fields: Chrome's own drawing (reversed Arabic placeholder, OS-ordered values) is
// hidden and replaced by lib/date-field-display.mjs text — see app/globals.css.
const DATE_OVERLAY_ATTRIBUTE = 'data-date-overlay';
const DATE_DISPLAY_ATTRIBUTE = 'data-date-display';
const NON_EDITING_KEYS = new Set(['Tab','Shift','Control','Alt','Meta','Escape','Enter','ArrowLeft','ArrowRight','CapsLock']);
const editingDateFields = new WeakSet();
const OBSERVED_ATTRIBUTES = [...SAFE_TEXT_ATTRIBUTES, 'type', 'readonly', 'disabled'];

function shouldSkip(node) {
  const element = node?.parentElement;
  if (!element) return false;
  if (SKIP_TAGS.has(element.tagName)) return true;
  return Boolean(element.closest('[contenteditable="true"]'));
}

function normalizeTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return;
  const value = node.nodeValue || '';
  if (!hasNonLatinNumerals(value)) return;
  const next = latinDigits(value);
  if (next !== value) node.nodeValue = next;
}

function isDateField(element) {
  return element instanceof HTMLInputElement && isOverlaidDateType(element.type);
}

function setAttributeIfChanged(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function syncDateField(element) {
  if (!(element instanceof HTMLInputElement)) return;
  if (!isDateField(element)) {
    if (element.hasAttribute(DATE_OVERLAY_ATTRIBUTE)) {
      element.removeAttribute(DATE_OVERLAY_ATTRIBUTE);
      element.removeAttribute(DATE_DISPLAY_ATTRIBUTE);
    }
    return;
  }
  // badInput = part of a date has been typed; keep Chrome's own segments visible then.
  const editing = editingDateFields.has(element) || Boolean(element.validity?.badInput);
  const { mode, display } = dateFieldDisplay({
    type: element.type,
    value: element.value,
    placeholder: element.getAttribute('placeholder'),
    editing,
  });
  setAttributeIfChanged(element, DATE_DISPLAY_ATTRIBUTE, display);
  setAttributeIfChanged(element, DATE_OVERLAY_ATTRIBUTE, mode);
}

function normalizeControlValue(element) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  if (element instanceof HTMLInputElement) {
    syncDateField(element);
    const type=String(element.type||'text').toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) return;
    if (LATIN_NATIVE_INPUT_TYPES.has(type)) {
      // Day-first for date fields (browsers that honour lang would otherwise show mm/dd/yyyy).
      const lang = isOverlaidDateType(type) ? DATE_FIELD_LANG : 'en-US';
      if (element.lang !== lang) element.lang = lang;
      element.style.fontVariantNumeric='lining-nums tabular-nums';
    }
  }
  const value = element.value || '';
  if (!hasNonLatinNumerals(value)) return;
  const next = latinDigits(value);
  if (next === value) return;
  const start = typeof element.selectionStart === 'number' ? element.selectionStart : null;
  const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : null;
  element.value = next;
  if (start !== null && end !== null) {
    try { element.setSelectionRange(start,end); } catch {}
  }
}

function normalizeAttributes(element) {
  if (!(element instanceof Element)) return;
  for (const name of SAFE_TEXT_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value || !hasNonLatinNumerals(value)) continue;
    element.setAttribute(name, latinDigits(value));
  }
  normalizeControlValue(element);
}

function normalizeTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    normalizeTextNode(root);
    return;
  }
  if (!(root instanceof Element) && root !== document.body) return;

  if (root instanceof Element) normalizeAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current.nodeType === Node.TEXT_NODE) normalizeTextNode(current);
    else normalizeAttributes(current);
  }
}

export default function LatinDigitsRuntime() {
  useEffect(() => {
    normalizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') normalizeTextNode(mutation.target);
        if (mutation.type === 'attributes') normalizeAttributes(mutation.target);
        for (const node of mutation.addedNodes || []) normalizeTree(node);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES,
    });

    const onInput = (event) => normalizeControlValue(event.target);
    const beforePrint = () => normalizeTree(document.body);
    const onDateKeyDown = (event) => {
      const element = event.target;
      if (!isDateField(element) || NON_EDITING_KEYS.has(event.key)) return;
      editingDateFields.add(element);
      syncDateField(element);
    };
    const onDateFocusOut = (event) => {
      const element = event.target;
      if (!isDateField(element)) return;
      editingDateFields.delete(element);
      syncDateField(element);
    };
    const onDateFocusIn = (event) => { if (isDateField(event.target)) syncDateField(event.target); };
    // A click opens the calendar instead of focusing a hidden segment.
    const onDateClick = (event) => {
      const element = event.target;
      if (!isDateField(element) || element.readOnly || element.disabled) return;
      if (element.getAttribute(DATE_OVERLAY_ATTRIBUTE) === 'off' || typeof element.showPicker !== 'function') return;
      try { element.showPicker(); } catch {}
    };
    const onFormReset = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      setTimeout(() => { for (const element of form.elements) syncDateField(element); }, 0);
    };
    document.addEventListener('input',onInput,true);
    document.addEventListener('change',onInput,true);
    document.addEventListener('keydown',onDateKeyDown,true);
    document.addEventListener('focusout',onDateFocusOut,true);
    document.addEventListener('focusin',onDateFocusIn,true);
    document.addEventListener('click',onDateClick,true);
    document.addEventListener('reset',onFormReset,true);
    window.addEventListener('beforeprint',beforePrint);

    return () => {
      observer.disconnect();
      document.removeEventListener('input',onInput,true);
      document.removeEventListener('change',onInput,true);
      document.removeEventListener('keydown',onDateKeyDown,true);
      document.removeEventListener('focusout',onDateFocusOut,true);
      document.removeEventListener('focusin',onDateFocusIn,true);
      document.removeEventListener('click',onDateClick,true);
      document.removeEventListener('reset',onFormReset,true);
      window.removeEventListener('beforeprint',beforePrint);
    };
  }, []);

  return null;
}
