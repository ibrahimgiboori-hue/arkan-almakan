'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dataEntryTheaterFor } from '@/lib/ui-governance';

const CONTROL_SELECTOR = [
  "input:not([type='hidden']):not([type='search']):not([type='submit']):not([type='button'])",
  'select',
  'textarea',
  "[contenteditable='true']",
].join(',');

function cleanText(value='') {
  return String(value).replace(/\s+/g,' ').trim();
}

function looksLikeFilter(root) {
  if (!root) return true;
  if (root.matches?.('[data-entry-ignore]') || root.closest?.('[data-entry-ignore]')) return true;
  const heading = cleanText(root.querySelector?.('h1,h2,h3,legend,[data-section-title]')?.textContent || '');
  const text = `${heading} ${cleanText(root.getAttribute?.('aria-label') || '')}`;
  return /بحث|التصفية|فلتر|filter|search/i.test(text);
}

function controlsIn(root) {
  return [...(root?.querySelectorAll?.(CONTROL_SELECTOR) || [])].filter((node) => {
    if (node.disabled) return false;
    if (node.closest('[data-entry-ignore]')) return false;
    return true;
  });
}

function hasCommitAction(root) {
  const buttons = [...(root?.querySelectorAll?.("button,a,[role='button'],input[type='submit']") || [])];
  return buttons.some((node) => /حفظ|إنشاء|إضافة|تعديل|تحديث|اعتماد|إرسال|تسجيل|save|create|update|submit/i.test(cleanText(node.textContent || node.value || '')));
}

function qualifies(root, minimum=4) {
  if (!root || looksLikeFilter(root)) return false;
  const controls = controlsIn(root);
  if (controls.length < minimum) return false;
  return hasCommitAction(root) || controls.length >= 6 || controls.some((node) => node.tagName === 'TEXTAREA' || node.getAttribute?.('contenteditable') === 'true');
}

function sectionLike(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.matches('[data-entry-surface],section,article')) return true;
  const cls = typeof node.className === 'string' ? node.className.toLowerCase() : '';
  return cls.includes('section') || cls.includes('editor') || cls.includes('form');
}

function findEntryRoot(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-entry-ignore],[data-entry-theater-bar]')) return null;

  const explicit = target.closest('[data-entry-surface]');
  if (explicit) return explicit;

  const form = target.closest('form');
  if (form && qualifies(form,3)) return form;

  const content = target.closest('[data-content-governance]');
  let node = target.parentElement;
  let best = null;
  while (node && node !== content && node !== document.body) {
    if (sectionLike(node) && qualifies(node,4)) best = node;
    node = node.parentElement;
  }
  return best;
}

function inferTitle(root) {
  const local = root?.querySelector?.('h1,h2,h3,legend,[data-section-title]');
  if (cleanText(local?.textContent)) return cleanText(local.textContent);
  const page = document.querySelector('[data-content-governance] h1,.page-head h1');
  if (cleanText(page?.textContent)) return cleanText(page.textContent);
  return 'إدخال البيانات';
}

export default function EntryTheaterController() {
  const pathname = usePathname();
  const router = useRouter();
  const routeTheater = dataEntryTheaterFor(pathname);
  const activeRootRef = useRef(null);
  const [inlineTitle,setInlineTitle] = useState('');

  function clearInlineTheater() {
    const root = activeRootRef.current;
    if (root?.isConnected) delete root.dataset.entryTheaterRoot;
    activeRootRef.current = null;
    setInlineTitle('');
    if (!routeTheater) delete document.body.dataset.entryTheater;
  }

  useEffect(() => {
    clearInlineTheater();
    if (routeTheater) document.body.dataset.entryTheater = 'route';
    else delete document.body.dataset.entryTheater;

    function activate(root) {
      if (!root || routeTheater) return;
      if (activeRootRef.current === root) return;
      if (activeRootRef.current?.isConnected) delete activeRootRef.current.dataset.entryTheaterRoot;
      activeRootRef.current = root;
      root.dataset.entryTheaterRoot = 'true';
      document.body.dataset.entryTheater = 'inline';
      setInlineTitle(inferTitle(root));
    }

    function onFocusIn(event) {
      const root = findEntryRoot(event.target);
      if (root) activate(root);
    }

    function onPointerDown(event) {
      const editable = event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null;
      if (!editable) return;
      const root = findEntryRoot(editable);
      if (root) activate(root);
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (activeRootRef.current && !routeTheater) {
        event.preventDefault();
        clearInlineTheater();
      }
    }

    document.addEventListener('focusin',onFocusIn,true);
    document.addEventListener('pointerdown',onPointerDown,true);
    window.addEventListener('keydown',onKeyDown);
    return () => {
      document.removeEventListener('focusin',onFocusIn,true);
      document.removeEventListener('pointerdown',onPointerDown,true);
      window.removeEventListener('keydown',onKeyDown);
      if (activeRootRef.current?.isConnected) delete activeRootRef.current.dataset.entryTheaterRoot;
      activeRootRef.current = null;
      delete document.body.dataset.entryTheater;
    };
  }, [pathname,routeTheater?.key]);

  const active = Boolean(routeTheater || inlineTitle);
  if (!active) return null;

  function goBack() {
    if (!routeTheater && activeRootRef.current) {
      clearInlineTheater();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(routeTheater?.fallback || '/dashboard/workspace');
  }

  return (
    <header className="constitution-entry-theater-bar" data-entry-theater-bar="true">
      <button type="button" className="constitution-entry-theater-back" onClick={goBack}>
        <span aria-hidden="true">←</span>
        <span>رجوع</span>
      </button>
      <div className="constitution-entry-theater-heading">
        <span>{routeTheater?.description || 'مساحة إدخال'}</span>
        <strong>{routeTheater?.title || inlineTitle || 'إدخال البيانات'}</strong>
      </div>
    </header>
  );
}
