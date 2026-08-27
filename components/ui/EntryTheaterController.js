'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dataEntryTheaterFor } from '@/lib/ui-governance';
import { logicalBackTarget } from '@/lib/navigation-history';

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
  const controls = [...(root?.querySelectorAll?.("button,input[type='submit'],[role='button']") || [])];
  return controls.some((node) => {
    const type = String(node.getAttribute?.('type') || '').toLowerCase();
    if (type === 'submit') return true;
    const text = cleanText(node.textContent || node.value || '');
    // «تعديل» وحدها قد تكون زر صف داخل جدول وليست حفظاً لنموذج.
    return /حفظ|إنشاء|إضافة|تحديث|اعتماد|إرسال|تسجيل|save|create|update|submit/i.test(text);
  });
}

function qualifiesForm(root, minimum=2) {
  if (!root || root.tagName !== 'FORM' || looksLikeFilter(root)) return false;
  const controls = controlsIn(root);
  if (controls.length < minimum) return false;
  return hasCommitAction(root);
}

function isVisible(node) {
  if (!node?.isConnected) return false;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findEntryRoot(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-entry-ignore],[data-entry-theater-bar]')) return null;

  // التعريف الصريح هو المرجع الأول دائماً.
  const explicit = target.closest('[data-entry-surface]');
  if (explicit) return explicit;

  // لا نخمن من section/article أو كثرة الحقول. الجداول وشاشات العرض قد تحتوي
  // عشرات select/buttons ولا يجوز أن تتحول إلى مسرح إدخال بسبب ذلك.
  const form = target.closest('form');
  return form && qualifiesForm(form,2) ? form : null;
}

function candidateFromNode(node) {
  if (!(node instanceof Element)) return null;

  const explicit = node.matches?.('[data-entry-surface]')
    ? node
    : node.querySelector?.('[data-entry-surface]');
  if (explicit && isVisible(explicit)) return explicit;

  const forms = [];
  if (node.matches?.('form')) forms.push(node);
  forms.push(...(node.querySelectorAll?.('form') || []));
  return forms.find((form) => isVisible(form) && qualifiesForm(form,2)) || null;
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
      if (!root || routeTheater || !isVisible(root)) return;
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

    // النماذج التي تظهر بعد الضغط على «إضافة/إنشاء» تدخل المسرح لحظة ظهورها.
    // نراقب forms صريحة فقط، ولا نراقب sections أو articles إطلاقاً.
    const observer = new MutationObserver((mutations) => {
      if (routeTheater || activeRootRef.current) return;
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          const candidate = candidateFromNode(added);
          if (candidate) {
            requestAnimationFrame(() => activate(candidate));
            return;
          }
        }
      }
    });
    const contentRoot = document.querySelector('[data-content-governance]') || document.body;
    observer.observe(contentRoot,{childList:true,subtree:true});

    document.addEventListener('focusin',onFocusIn,true);
    document.addEventListener('pointerdown',onPointerDown,true);
    window.addEventListener('keydown',onKeyDown);
    return () => {
      observer.disconnect();
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
    router.push(logicalBackTarget(pathname, routeTheater?.fallback || '/dashboard/workspace'));
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
