'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dataEntryTheaterFor } from '@/lib/ui-governance';
import { NAVIGATION_POLICY } from '@/lib/navigation-constitution';
import { logicalBackTarget } from '@/lib/navigation-history';

function cleanText(value='') {
  return String(value).replace(/\s+/g,' ').trim();
}

function isVisible(node) {
  if (!node?.isConnected) return false;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function explicitEntryRoot(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-entry-ignore],[data-entry-theater-bar]')) return null;
  const root = target.closest('[data-entry-surface]');
  return root && isVisible(root) ? root : null;
}

function explicitCandidateFromNode(node) {
  if (!(node instanceof Element)) return null;
  const root = node.matches?.('[data-entry-surface]')
    ? node
    : node.querySelector?.('[data-entry-surface]');
  return root && isVisible(root) ? root : null;
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
      if (NAVIGATION_POLICY.entryActivation !== 'explicit-only') return;
      if (!root.matches?.('[data-entry-surface]')) return;
      if (activeRootRef.current === root) return;
      if (activeRootRef.current?.isConnected) delete activeRootRef.current.dataset.entryTheaterRoot;
      activeRootRef.current = root;
      root.dataset.entryTheaterRoot = 'true';
      document.body.dataset.entryTheater = 'inline';
      setInlineTitle(inferTitle(root));
    }

    function onFocusIn(event) {
      const root = explicitEntryRoot(event.target);
      if (root) activate(root);
    }

    function onPointerDown(event) {
      const root = explicitEntryRoot(event.target);
      if (root) activate(root);
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (activeRootRef.current && !routeTheater) {
        event.preventDefault();
        clearInlineTheater();
      }
    }

    // لا يوجد تخمين من form/select/table. المسرح لا يبدأ إلا بعلامة صريحة
    // data-entry-surface أو بمسار إدخال رسمي في الدستور.
    const observer = new MutationObserver((mutations) => {
      if (routeTheater || activeRootRef.current) return;
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          const candidate = explicitCandidateFromNode(added);
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
