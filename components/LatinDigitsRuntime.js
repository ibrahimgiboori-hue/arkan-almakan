'use client';

import { useEffect } from 'react';
import { hasNonLatinNumerals, latinDigits } from '@/lib/latin-digits';

const SKIP_TAGS = new Set(['SCRIPT','STYLE','TEXTAREA','CODE','PRE']);
const SAFE_TEXT_ATTRIBUTES = ['title','aria-label','placeholder'];

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

function normalizeAttributes(element) {
  if (!(element instanceof Element)) return;
  for (const name of SAFE_TEXT_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value || !hasNonLatinNumerals(value)) continue;
    element.setAttribute(name, latinDigits(value));
  }
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

    return () => observer.disconnect();
  }, []);

  return null;
}
