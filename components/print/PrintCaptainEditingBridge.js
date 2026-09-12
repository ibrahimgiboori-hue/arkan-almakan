'use client';

import { useEffect } from 'react';

const CAPTAIN_BUTTON_SELECTOR = '.constitution-paged-layoutbar > button';
const PRINT_ROOT_SELECTOR = '.print-constitution[data-print-document]';
const BRIDGE_MARKER = 'printWorkbenchEditingBridge';

/**
 * Keeps the global content workbench and the Captain on the same editing state.
 * Some print surfaces contain more than one governed DOM copy (measurement +
 * physical page). The workbench must never infer editing from whichever copy
 * happens to be first in the DOM. The Captain button is the authoritative UI
 * state, so we mirror that state to every governed root for consistent tooling.
 */
export default function PrintCaptainEditingBridge() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const button = document.querySelector(CAPTAIN_BUTTON_SELECTOR);
        const active = Boolean(button?.classList.contains('active'));
        const roots = [...document.querySelectorAll(PRINT_ROOT_SELECTOR)];

        roots.forEach((root) => {
          if (active) {
            if (!root.classList.contains('print-layout-editing')) {
              root.classList.add('print-layout-editing');
              root.dataset[BRIDGE_MARKER] = 'true';
            }
          } else if (root.dataset[BRIDGE_MARKER] === 'true') {
            root.classList.remove('print-layout-editing');
            delete root.dataset[BRIDGE_MARKER];
          }
        });

        document.documentElement.dataset.printCaptainEditing = active ? 'true' : 'false';
        window.dispatchEvent(new CustomEvent('arkan:print-captain-editing-changed', {
          detail:{ editing:active },
        }));
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree:true,
      childList:true,
      attributes:true,
      attributeFilter:['class','data-print-document'],
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.querySelectorAll(`[data-${BRIDGE_MARKER.replace(/[A-Z]/g,(m)=>`-${m.toLowerCase()}`)}="true"]`).forEach((root)=>{
        root.classList.remove('print-layout-editing');
        delete root.dataset[BRIDGE_MARKER];
      });
      delete document.documentElement.dataset.printCaptainEditing;
    };
  }, []);

  return null;
}
