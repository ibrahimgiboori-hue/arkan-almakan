'use client';

import { useEffect, useRef, useState } from 'react';
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

function numericTarget(target) {
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.dataset.normalizeNumeric === 'false') return false;
  const mode = String(target.inputMode || '').toLowerCase();
  return target.type === 'number' || mode === 'numeric' || mode === 'decimal' || target.dataset.normalizeNumeric === 'true';
}

function normalizeLocalizedNumberText(value) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
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

function syncLedgerOverflow(node) {
  if (!(node instanceof HTMLElement)) return;
  const max = Math.max(0, node.scrollWidth - node.clientWidth);
  if (max <= 2) {
    node.setAttribute('data-ledger-overflow', 'false');
    node.setAttribute('data-ledger-scroll-position', 'none');
    return;
  }
  const offset = Math.min(max, Math.abs(Number(node.scrollLeft) || 0));
  const position = offset <= 2 ? 'start' : offset >= max - 2 ? 'end' : 'middle';
  node.setAttribute('data-ledger-overflow', 'true');
  node.setAttribute('data-ledger-scroll-position', position);
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
    syncLedgerOverflow(node);
  });

  root.querySelectorAll?.('[data-record-row="true"]').forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      row.setAttribute('data-record-selected', checkbox.checked ? 'true' : 'false');
    }
  });

  root.querySelectorAll?.('input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]').forEach((field) => {
    if (!(field instanceof HTMLInputElement) || field.dataset.preserveDirection === 'true') return;
    if (!field.hasAttribute('dir')) field.setAttribute('dir', 'ltr');
    field.setAttribute('data-technical-field', 'true');
  });
}

function nearestSaveTarget(eventTarget) {
  const source = eventTarget instanceof Element ? eventTarget : null;
  const form = source?.closest?.('form');
  if (form instanceof HTMLFormElement) {
    const formSubmit = Array.from(form.querySelectorAll('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])'))
      .find((node) => node instanceof HTMLElement && visible(node));
    if (formSubmit instanceof HTMLElement) return formSubmit;
  }

  const centralSave = Array.from(document.querySelectorAll(
    '[data-program-action="true"][data-action-kind="save"]:not([disabled]), [data-page-command-save="true"]:not([disabled])'
  )).find((node) => node instanceof HTMLElement && visible(node));
  return centralSave instanceof HTMLElement ? centralSave : null;
}

export default function PortalExperienceRuntime({ children }) {
  const pathname = usePathname();
  const returnFocusRef = useRef(null);
  const focusNavOnOpenRef = useRef(false);
  const submitTimesRef = useRef(new WeakMap());
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!(shell instanceof HTMLElement)) return undefined;
    const attrs = portalExperienceDataAttributes();
    Object.entries(attrs).forEach(([name, value]) => shell.setAttribute(name, value));
    return () => Object.keys(attrs).forEach((name) => shell.removeAttribute(name));
  }, []);

  useEffect(() => {
    function syncNetwork() {
      const nextOnline = navigator.onLine !== false;
      setOnline(nextOnline);
      const shell = document.querySelector('.rawDashboardShell');
      if (shell instanceof HTMLElement) shell.setAttribute('data-network-status', nextOnline ? 'online' : 'offline');
    }
    syncNetwork();
    window.addEventListener('online', syncNetwork);
    window.addEventListener('offline', syncNetwork);
    return () => {
      window.removeEventListener('online', syncNetwork);
      window.removeEventListener('offline', syncNetwork);
    };
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

    function syncAllLedgers() {
      document.querySelectorAll('[data-table-surface="true"]').forEach(syncLedgerOverflow);
    }
    function onLedgerScroll(event) {
      const node = event.target;
      if (node instanceof HTMLElement && node.matches('[data-table-surface="true"]')) syncLedgerOverflow(node);
    }
    window.addEventListener('resize', syncAllLedgers);
    document.addEventListener('scroll', onLedgerScroll, true);
    const frame = window.requestAnimationFrame(syncAllLedgers);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncAllLedgers);
      document.removeEventListener('scroll', onLedgerScroll, true);
    };
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
      if (!nav.contains(event.target)) return;
      if (event.key === 'Escape') {
        window.requestAnimationFrame(() => returnFocusRef.current?.focus?.({ preventScroll:true }));
        return;
      }
      if (typingTarget(event.target) || !PORTAL_EXPERIENCE_POLICY.navigation.keyboard.includes(event.key)) return;

      const items = navFocusable(nav);
      if (!items.length) return;
      const current = event.target instanceof Element ? event.target.closest('.appNavBack, .appNavRow, button') : null;

      if (event.key === PORTAL_EXPERIENCE_POLICY.navigation.rtlForwardKey) {
        if (current instanceof HTMLElement && current.matches('.appNavRowParent, .appNavProjectGroupTitle')) {
          event.preventDefault();
          current.click();
        }
        return;
      }

      if (event.key === PORTAL_EXPERIENCE_POLICY.navigation.rtlBackKey) {
        const back = nav.querySelector('.appNavBack');
        if (back instanceof HTMLElement && visible(back)) {
          event.preventDefault();
          back.click();
        }
        return;
      }

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
      if (event.key === 'PageDown') index = Math.min(rows.length - 1, currentIndex + PORTAL_EXPERIENCE_POLICY.records.pageJumpRows);
      if (event.key === 'PageUp') index = Math.max(0, currentIndex - PORTAL_EXPERIENCE_POLICY.records.pageJumpRows);
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

    function onPaste(event) {
      const field = event.target;
      if (!numericTarget(field)) return;
      const raw = event.clipboardData?.getData('text');
      if (typeof raw !== 'string') return;
      const normalized = normalizeLocalizedNumberText(raw);
      if (normalized === raw) return;
      event.preventDefault();
      if (field.type === 'number' || field.selectionStart == null || field.selectionEnd == null) {
        field.value = normalized;
      } else {
        field.setRangeText(normalized, field.selectionStart, field.selectionEnd, 'end');
      }
      field.dispatchEvent(new Event('input', { bubbles:true }));
    }

    function onBlur(event) {
      const field = event.target;
      if (!numericTarget(field) || field.type === 'number') return;
      const normalized = normalizeLocalizedNumberText(field.value);
      if (normalized === field.value) return;
      field.value = normalized;
      field.dispatchEvent(new Event('input', { bubbles:true }));
      field.dispatchEvent(new Event('change', { bubbles:true }));
    }

    function onWheel(event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || field.type !== 'number') return;
      if (field.dataset.allowWheelChange === 'true' || document.activeElement !== field) return;
      field.blur();
    }

    function onSaveShortcut(event) {
      if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 's') return;
      event.preventDefault();
      const target = nearestSaveTarget(event.target);
      window.dispatchEvent(new CustomEvent('arkan:save-requested', {
        detail:{ pathname, handled:Boolean(target) },
      }));
      target?.click?.();
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
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('blur', onBlur, true);
    document.addEventListener('wheel', onWheel, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('keydown', onSaveShortcut);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('blur', onBlur, true);
      document.removeEventListener('wheel', onWheel, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('keydown', onSaveShortcut);
    };
  }, [pathname]);

  return <>
    {!online ? (
      <div className="appOfflineNotice" role="status" aria-live="polite" data-network-notice="offline">
        لا يوجد اتصال بالإنترنت. يمكنك مراجعة البيانات الظاهرة، لكن أي حفظ أو إرسال قد لا يكتمل حتى يعود الاتصال.
      </div>
    ) : null}
    {children}
  </>;
}
