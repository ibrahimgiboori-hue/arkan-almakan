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
  markAll(root, '.appNavRail', { 'data-ui-slot':uiSlot('navigationRail'), 'data-ui-role':'primary-navigation' });
  markAll(root, '.appContextNav', { 'data-ui-slot':uiSlot('navigationPanel'), 'data-ui-role':'contextual-navigation' });
  markAll(root, '.appNavContextHeader', { 'data-ui-slot':uiSlot('navigationHeader') });
  markAll(root, '.appNavContextSection', { 'data-ui-slot':uiSlot('navigationGroup') });
  markAll(root, '.appRailItem, .appNavContextItem, .appMobilePortalStrip button', { 'data-ui-slot':uiSlot('navigationRow') });
  markAll(root, '.appNavContextFooter', { 'data-ui-slot':uiSlot('navigationFooter') });
  markAll(root, '.appNavMobileTrigger, .appRailCollapse, .appNavDesktopCollapse, .appNavMobileClose', { 'data-ui-slot':uiSlot('navigationTrigger') });
  markAll(root, '.appBodyStage', { 'data-ui-slot':uiSlot('applicationStage') });
  markAll(root, '.rawDashboardContent', { 'data-ui-slot':uiSlot('applicationContent'), 'data-ui-role':'application-content' });
  markAll(root, '.workSheetMount', { 'data-ui-slot':uiSlot('routeMount'), 'data-ui-role':'route-mount' });
  markAll(root, '.appActionContextAlert', { 'data-ui-slot':uiSlot('actionContextBanner') });
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
