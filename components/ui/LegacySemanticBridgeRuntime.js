'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { uiSlot } from '@/lib/ui-skin-contract';

function mark(root, selector, attributes) {
  const nodes = [];
  if (root instanceof Element && root.matches(selector)) nodes.push(root);
  root.querySelectorAll?.(selector).forEach((node) => nodes.push(node));
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    Object.entries(attributes).forEach(([name, value]) => {
      if (!node.hasAttribute(name)) node.setAttribute(name, value);
    });
    node.setAttribute('data-ui-legacy-adapted', 'true');
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
      }
    });
    observer.observe(host, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, [pathname]);

  return children;
}
