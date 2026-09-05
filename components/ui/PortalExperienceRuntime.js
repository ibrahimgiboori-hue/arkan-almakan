'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { PORTAL_EXPERIENCE_POLICY, portalExperienceDataAttributes } from '@/lib/portal-experience-constitution';

function visible(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function typingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function navFocusable(nav) {
  return Array.from(nav.querySelectorAll(
    '.appNavBack, .appNavRow, .appNavTopLine button:not([disabled]), .appNavBottomActions button:not([disabled])'
  )).filter(visible);
}

function primaryRowControl(row) {
  if (!(row instanceof HTMLElement)) return null;
  const controls = Array.from(row.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  return controls.find((node) => {
    if (!(node instanceof HTMLElement) || !visible(node)) return false;
    if (node.closest('[data-record-actions="true"]')) return false;
    if (node.matches('input, select, textarea')) return false;
    return true;
  }) || controls.find((node) => node instanceof HTMLElement && visible(node)) || null;
}

function rowSurface(row) {
  return row?.closest?.('[data-record-list="true"], [data-table-surface="true"], [data-selection-surface="true"]') || null;
}

function surfaceRows(surface) {
  if (!(surface instanceof HTMLElement)) return [];
  return Array.from(surface.querySelectorAll('[data-record-row="true"]')).filter(visible);
}

function focusRow(row) {
  const control = primaryRowControl(row);
  if (control instanceof HTMLElement) {
    control.focus({ preventScroll:true });
    row.scrollIntoView({ block:'nearest', inline:'nearest' });
    return true;
  }
  if (row instanceof HTMLElement) {
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.focus({ preventScroll:true });
    row.scrollIntoView({ block:'nearest', inline:'nearest' });
    return true;
  }
  return false;
}

function applySemanticBehavior(root = document) {
  root.querySelectorAll?.('[data-inline-feedback="true"], [data-work-inline-status="true"]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', node.getAttribute('role') === 'alert' ? 'assertive' : 'polite');
    if (!node.hasAttribute('role')) node.setAttribute('role', 'status');
  });

  root.querySelectorAll?.('[data-table-surface="true"]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.hasAttribute('tabindex')) node.tabIndex = 0;
    if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', 'جدول بيانات');
    node.setAttribute('data-ledger-scroll-ready', 'true');
  });

  root.querySelectorAll?.('[data-record-row="true"]').forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      row.setAttribute('data-record-selected', checkbox.checked ? 'true' : 'false');
    }
  });
}

export default function PortalExperienceRuntime({ children }) {
  const pathname = usePathname();
  const returnFocusRef = useRef(null);
  const focusNavOnOpenRef = useRef(false);
  const submitTimesRef = useRef(new WeakMap());

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!(shell instanceof HTMLElement)) return undefined;
    const attrs = portalExperienceDataAttributes();
    Object.entries(attrs).forEach(([name, value]) => shell.setAttribute(name, value));
    return () => Object.keys(attrs).forEach((name) => shell.removeAttribute(name));
  }, []);

  useEffect(() => {
    applySemanticBehavior(document);
    const host = document.querySelector('.workSheetMount') || document.body;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) applySemanticBehavior(node);
        });
      }
    });
    observer.observe(host, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const nav = document.querySelector('.appContextNav');
    if (!(nav instanceof HTMLElement)) return undefined;

    function syncActiveDestination() {
      nav.querySelectorAll('.appNavRow[aria-current]').forEach((node) => node.removeAttribute('aria-current'));
      const active = nav.querySelector('.appNavRow[data-active="true"]');
      if (active instanceof HTMLElement) active.setAttribute('aria-current', 'page');
    }

    function focusActiveDestination() {
      const target = nav.querySelector('.appNavRow[data-active="true"]') || navFocusable(nav)[0];
      if (target instanceof HTMLElement) target.focus({ preventScroll:true });
    }

    syncActiveDestination();
    const observer = new MutationObserver(() => {
      syncActiveDestination();
      if (nav.getAttribute('data-open') === 'true' && focusNavOnOpenRef.current) {
        focusNavOnOpenRef.current = false;
        requestAnimationFrame(focusActiveDestination);
      }
    });
    observer.observe(nav, { attributes:true, subtree:true, attributeFilter:['data-open', 'data-active'] });

    function rememberTrigger(event) {
      const target = event.target instanceof Element ? event.target.closest('.appNavTouchTrigger, .appNavHotZone') : null;
      if (!(target instanceof HTMLElement)) return;
      returnFocusRef.current = target;
      focusNavOnOpenRef.current = true;
    }

    function onNavKeyDown(event) {
      if (!nav.contains(event.target) || typingTarget(event.target)) return;
      if (!PORTAL_EXPERIENCE_POLICY.navigation.keyboard.includes(event.key)) return;
      const items = navFocusable(nav);
      if (!items.length) return;
      const current = event.target instanceof Element ? event.target.closest('.appNavBack, .appNavRow, button') : null;
      let index = Math.max(0, items.indexOf(current));
      if (event.key === 'ArrowDown') index = (index + 1) % items.length;
      if (event.key === 'ArrowUp') index = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = items.length - 1;
      event.preventDefault();
      items[index]?.focus?.({ preventScroll:true });
      items[index]?.scrollIntoView?.({ block:'nearest' });
    }

    function onGlobalKeyDown(event) {
      if (!(event.altKey && !event.ctrlKey && !event.metaKey && String(event.key).toLowerCase() === 'm')) return;
      event.preventDefault();
      const open = nav.getAttribute('data-open') === 'true';
      if (open) {
        const close = nav.querySelector('.appNavTopLine button');
        close?.click?.();
        requestAnimationFrame(() => returnFocusRef.current?.focus?.({ preventScroll:true }));
        return;
      }
      const trigger = document.querySelector('.appNavTouchTrigger') || document.querySelector('.appNavHotZone');
      if (trigger instanceof HTMLElement) {
        returnFocusRef.current = trigger;
        focusNavOnOpenRef.current = true;
        trigger.click();
      }
    }

    document.addEventListener('pointerdown', rememberTrigger, true);
    nav.addEventListener('keydown', onNavKeyDown);
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', rememberTrigger, true);
      nav.removeEventListener('keydown', onNavKeyDown);
      window.removeEventListener('keydown', onGlobalKeyDown);
    };
  }, [pathname]);

  useEffect(() => {
    function onRowKeyDown(event) {
      if (typingTarget(event.target)) return;
      const row = event.target instanceof Element ? event.target.closest('[data-record-row="true"]') : null;
      if (!(row instanceof HTMLElement)) return;
      const surface = rowSurface(row);
      const rows = surfaceRows(surface);
      if (!rows.length) return;
      const currentIndex = rows.indexOf(row);
      if (currentIndex < 0) return;

      if (event.key === 'Enter' && event.target === row) {
        const control = primaryRowControl(row);
        if (control instanceof HTMLElement) {
          event.preventDefault();
          control.click();
        }
        return;
      }

      if (!PORTAL_EXPERIENCE_POLICY.records.keyboard.includes(event.key) || event.key === 'Enter') return;
      let index = currentIndex;
      if (event.key === 'ArrowDown') index = Math.min(rows.length - 1, currentIndex + 1);
      if (event.key === 'ArrowUp') index = Math.max(0, currentIndex - 1);
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = rows.length - 1;
      if (index === currentIndex && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      focusRow(rows[index]);
    }

    function onSelectionChange(event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
      const row = input.closest('[data-record-row="true"]');
      if (row instanceof HTMLElement) row.setAttribute('data-record-selected', input.checked ? 'true' : 'false');
    }

    document.addEventListener('keydown', onRowKeyDown);
    document.addEventListener('change', onSelectionChange, true);
    return () => {
      document.removeEventListener('keydown', onRowKeyDown);
      document.removeEventListener('change', onSelectionChange, true);
    };
  }, []);

  useEffect(() => {
    function onInvalid(event) {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      field.setAttribute('aria-invalid', 'true');
      const form = field.closest('form');
      requestAnimationFrame(() => {
        const first = form?.querySelector(':invalid');
        if (first instanceof HTMLElement) {
          first.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
          try { first.focus({ preventScroll:true }); } catch { first.focus(); }
        }
      });
    }

    function onInput(event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      if (field.validity?.valid) field.removeAttribute('aria-invalid');
    }

    function onSubmit(event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.allowRepeatSubmit === 'true' || !form.checkValidity()) return;
      const now = Date.now();
      const last = submitTimesRef.current.get(form) || 0;
      if (now - last < PORTAL_EXPERIENCE_POLICY.forms.duplicateSubmitGuardMs) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      submitTimesRef.current.set(form, now);
      form.setAttribute('data-submit-guard', 'armed');
      window.setTimeout(() => {
        if (form.isConnected) form.removeAttribute('data-submit-guard');
      }, PORTAL_EXPERIENCE_POLICY.forms.duplicateSubmitGuardMs);
    }

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  return children;
}
