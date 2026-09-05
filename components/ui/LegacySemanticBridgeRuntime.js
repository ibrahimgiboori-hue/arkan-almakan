'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { uiSlot } from '@/lib/ui-skin-contract';

function collect(root, selector) {
  const nodes = [];
  if (root instanceof Element && root.matches(selector)) nodes.push(root);
  root.querySelectorAll?.(selector).forEach((node) => nodes.push(node));
  return nodes;
}

function mark(root, selector, attributes) {
  collect(root, selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    Object.entries(attributes).forEach(([name, value]) => {
      if (!node.hasAttribute(name)) node.setAttribute(name, value);
    });
    node.setAttribute('data-ui-legacy-adapted', 'true');
  });
}

function markLoading(root) {
  collect(root, ".empty, [data-ui-slot='empty']").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const text = String(node.textContent || '').trim();
    const loading = /^(?:جار(?:ٍ|ي)?|جاري)\s+(?:تحميل|التحميل|جلب|تجهيز|تهيئة)/u.test(text);
    if (loading) {
      node.setAttribute('data-ui-state', 'loading');
      node.setAttribute('aria-busy', 'true');
    } else if (node.getAttribute('data-ui-state') === 'loading') {
      node.removeAttribute('data-ui-state');
      node.removeAttribute('aria-busy');
    }
  });
}

function annotate(root = document) {
  mark(root, '.page:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('page'),
    'data-page-surface':'true',
  });
  mark(root, '.page-head:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('pageHeader'),
    'data-page-header':'true',
  });
  mark(root, '.section:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('section'),
    'data-data-surface':'true',
    'data-work-section-style':'boundary',
  });
  mark(root, '.section > header:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('sectionHeader'),
  });
  mark(root, '.card:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('section'),
    'data-ui-role':'legacy-card',
    'data-work-section-style':'boundary',
  });
  mark(root, '.tabs:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('toolbar'),
    'data-ui-role':'tabs',
  });
  mark(root, '.empty:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('empty'),
  });
  mark(root, '.msg:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('notice'),
  });
  mark(root, '.pill:not([data-ui-role])', {
    'data-ui-role':'status',
  });
  mark(root, '.stickybar:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('toolbar'),
    'data-ui-role':'legacy-stickybar',
  });
  mark(root, 'button.btn:not([data-ui-slot]), a.btn:not([data-ui-slot])', {
    'data-ui-slot':uiSlot('action'),
    'data-ui-control':'action',
    'data-ui-role':'legacy-action',
  });
  mark(root, '.grid:not([data-ui-role])', {
    'data-ui-role':'legacy-grid',
  });
  mark(root, '.field:not([data-ui-role])', {
    'data-ui-role':'field-group',
  });
  mark(root, '.form-grid:not([data-ui-role])', {
    'data-ui-role':'form-grid',
  });
  mark(root, '.rowsplit:not([data-ui-role])', {
    'data-ui-role':'row-split',
  });
  mark(root, 'table:not([data-ui-role])', {
    'data-ui-role':'table',
  });
  mark(root, '.shell:not([data-ui-role])', {
    'data-ui-role':'legacy-shell',
  });
  mark(root, '.side:not([data-ui-role])', {
    'data-ui-role':'legacy-side',
  });
  mark(root, '.main:not([data-ui-role])', {
    'data-ui-role':'legacy-main',
  });
  mark(root, '.topbar:not([data-ui-role])', {
    'data-ui-role':'legacy-topbar',
  });
  markLoading(root);
}

export default function LegacySemanticBridgeRuntime({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    const host = document.querySelector('.workSheetMount') || document.body;
    annotate(host);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) annotate(node);
        });
        if (mutation.type === 'characterData' && mutation.target?.parentElement) {
          annotate(mutation.target.parentElement);
        }
      }
    });
    observer.observe(host, { childList:true, subtree:true, characterData:true });
    return () => observer.disconnect();
  }, [pathname]);

  return children;
}
