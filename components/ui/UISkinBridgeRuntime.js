'use client';

import { useEffect } from 'react';
import { uiSlot } from '@/lib/ui-skin-contract';

function markAll(root, selector, attributes) {
  if (!(root instanceof Element || root instanceof Document)) return;
  const nodes = [];
  if (root instanceof Element && root.matches(selector)) nodes.push(root);
  root.querySelectorAll(selector).forEach((node) => nodes.push(node));
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    Object.entries(attributes).forEach(([name, value]) => {
      if (!node.hasAttribute(name)) node.setAttribute(name, value);
    });
  });
}

function annotate(root = document) {
  markAll(root, '.appContextNav', { 'data-ui-slot':uiSlot('navigation'), 'data-ui-role':'navigation' });
  markAll(root, '.appNavTopLine', { 'data-ui-slot':uiSlot('navigationHeader') });
  markAll(root, '.appNavRow, .appNavBack, .appNavProjectGroupTitle', { 'data-ui-slot':uiSlot('navigationRow') });
  markAll(root, '.appNavBottomActions', { 'data-ui-slot':uiSlot('navigationFooter') });
  markAll(root, '.appNavTouchTrigger, .appNavHotZone', { 'data-ui-slot':uiSlot('navigationTrigger') });
  markAll(root, '.rawDashboardContent', { 'data-ui-role':'application-content' });
  markAll(root, '.workSheetMount', { 'data-ui-role':'route-mount' });
  markAll(root, '.appActionFailure', { 'data-ui-role':'action-failure', 'data-ui-tone':'error' });
  markAll(root, '.appOfflineNotice', { 'data-ui-role':'network-notice', 'data-ui-tone':'warning' });
}

export default function UISkinBridgeRuntime({ children }) {
  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    if (!(shell instanceof HTMLElement)) return undefined;

    annotate(shell);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) annotate(node);
        });
      }
    });
    observer.observe(shell, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, []);

  return children;
}
