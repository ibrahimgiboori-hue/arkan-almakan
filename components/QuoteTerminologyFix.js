'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const REPLACEMENTS = [
  ['عمود الفئة', 'عمود سعر الوحدة'],
  ['الأسعار المذكورة أعلاه فئات للوحدة', 'الأسعار المذكورة أعلاه هي أسعار للوحدة'],
  ['الفئات لا تشمل ضريبة القيمة المضافة', 'أسعار الوحدة لا تشمل ضريبة القيمة المضافة'],
  ['عرض مقاطعيات — فئات بلا كميات', 'عرض مقاطعيات — أسعار وحدة بلا كميات'],
  ['جمع فئات وحدات مختلفة لا معنى له', 'جمع أسعار وحدات مختلفة لا معنى له'],
  ['الفئة', 'سعر الوحدة'],
];

function normalizeText(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    let value = node.nodeValue || '';
    let next = value;
    REPLACEMENTS.forEach(([from, to]) => { next = next.split(from).join(to); });
    if (next !== value) node.nodeValue = next;
  });
}

export default function QuoteTerminologyFix() {
  const pathname = usePathname();

  useEffect(() => {
    const isQuote = pathname?.startsWith('/dashboard/quotes/') || pathname?.startsWith('/print/quote/');
    if (!isQuote) return;

    normalizeText(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            let value = node.nodeValue || '';
            let next = value;
            REPLACEMENTS.forEach(([from, to]) => { next = next.split(from).join(to); });
            if (next !== value) node.nodeValue = next;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            normalizeText(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
