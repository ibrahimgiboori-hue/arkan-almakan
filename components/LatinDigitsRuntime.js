'use client';

import { useEffect } from 'react';
import { hasNonLatinNumerals, latinDigits } from '@/lib/latin-digits';

const SKIP_TAGS = new Set(['SCRIPT','STYLE','CODE','PRE']);
const SAFE_TEXT_ATTRIBUTES = ['title','aria-label','placeholder','value'];
const SKIP_INPUT_TYPES = new Set(['password','file']);

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

function normalizeControlValue(element) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  if (element instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(String(element.type||'').toLowerCase())) return;
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
      attributeFilter: SAFE_TEXT_ATTRIBUTES,
    });

    const onInput = (event) => normalizeControlValue(event.target);
    const beforePrint = () => normalizeTree(document.body);
    document.addEventListener('input',onInput,true);
    document.addEventListener('change',onInput,true);
    window.addEventListener('beforeprint',beforePrint);

    return () => {
      observer.disconnect();
      document.removeEventListener('input',onInput,true);
      document.removeEventListener('change',onInput,true);
      window.removeEventListener('beforeprint',beforePrint);
    };
  }, []);

  return null;
}
