'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { downloadQuoteExcel } from '@/lib/quote-excel';

function findEditorAnchor(quoteId) {
  const href = `/print/quote/${quoteId}`;
  return Array.from(document.querySelectorAll('a[href]')).find((node) => node.getAttribute('href') === href) || null;
}

function findPrintAnchor() {
  return document.querySelector('.qtoolbar .tb-group');
}

export default function QuoteExcelAction({ quoteId, placement = 'editor' }) {
  const [host, setHost] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!quoteId || typeof document === 'undefined') return undefined;

    const hostKey = `quote-excel-${placement}-${quoteId}`;
    let mountedHost = null;

    const mount = () => {
      const existing = document.querySelector(`[data-quote-excel-host="${hostKey}"]`);
      if (existing) {
        mountedHost = existing;
        setHost(existing);
        return true;
      }

      const anchor = placement === 'print' ? findPrintAnchor() : findEditorAnchor(quoteId);
      if (!anchor) return false;

      const node = document.createElement('span');
      node.dataset.quoteExcelHost = hostKey;
      node.style.display = 'contents';

      if (placement === 'print') {
        anchor.appendChild(node);
      } else {
        anchor.insertAdjacentElement('afterend', node);
      }

      mountedHost = node;
      setHost(node);
      return true;
    };

    if (mount()) {
      return () => {
        if (mountedHost?.isConnected) mountedHost.remove();
      };
    }

    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList:true, subtree:true });

    return () => {
      observer.disconnect();
      if (mountedHost?.isConnected) mountedHost.remove();
    };
  }, [quoteId, placement]);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const [quoteResult, linesResult, paymentsResult] = await Promise.all([
        supabase.from('quotations').select('*').eq('id', quoteId).maybeSingle(),
        supabase.from('quotation_lines').select('*').eq('quotation_id', quoteId).order('sort_order'),
        supabase.from('quotation_payments').select('*').eq('quotation_id', quoteId).order('sort_order'),
      ]);

      if (quoteResult.error) throw quoteResult.error;
      if (linesResult.error) throw linesResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      if (!quoteResult.data) throw new Error('لم يُعثر على عرض السعر.');

      await downloadQuoteExcel({
        quote:quoteResult.data,
        lines:linesResult.data || [],
        payments:paymentsResult.data || [],
      });
    } catch (error) {
      console.error('Quotation Excel export failed', error);
      window.alert(`تعذّر تحميل Excel: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  }

  if (!host) return null;

  const label = busy ? 'جارٍ تجهيز Excel…' : 'تحميل Excel';
  const button = placement === 'print'
    ? <button type="button" disabled={busy} onClick={download}>{label}</button>
    : <button type="button" className="btn ghost" disabled={busy} onClick={download}>{label}</button>;

  return createPortal(button, host);
}
