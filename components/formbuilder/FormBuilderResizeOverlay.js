'use client';

import { useEffect, useMemo, useState } from 'react';
import ResizableLayoutGrid from './ResizableLayoutGrid';

function nativeSet(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, String(value));
  else input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function readGroups() {
  if (typeof document === 'undefined') return [];
  const sections = [...document.querySelectorAll('.page > .section, .page .section')];
  const groups = [];

  sections.forEach((section, sectionIndex) => {
    if (section.closest('[data-resize-overlay="true"]')) return;
    const table = section.querySelector('table');
    if (!table) return;
    const heads = [...table.querySelectorAll('thead th')].map((x) => (x.textContent || '').trim());
    const widthIndex = heads.findIndex((x) => x === 'العرض');
    if (widthIndex < 0) return;

    const rows = [...table.querySelectorAll('tbody tr')];
    const items = [];
    const bindings = [];

    rows.forEach((row, rowIndex) => {
      const cells = [...row.children];
      const widthCell = cells[widthIndex];
      const widthInput = widthCell?.querySelector('input[type="number"]');
      if (!widthInput) return;
      const labelInput = cells[0]?.querySelector('input');
      const keyInput = cells[2]?.querySelector('input');
      const typeSelect = cells[3]?.querySelector('select');
      const span = Math.max(1, Math.min(12, Number(widthInput.value || 1)));
      items.push({
        key: keyInput?.value || `row_${rowIndex}`,
        label: labelInput?.value || 'حقل بلا تسمية',
        type: typeSelect?.value || 'text',
        span,
      });
      bindings.push(widthInput);
    });

    if (!items.length) return;
    const title = section.querySelector('header h2')?.textContent?.trim() || `القسم ${sectionIndex + 1}`;
    groups.push({
      id: `${sectionIndex}-${title}`,
      title,
      items,
      bindings,
      isTable: title.includes('جدول'),
    });
  });

  return groups;
}

export default function FormBuilderResizeOverlay() {
  const [groups, setGroups] = useState([]);
  const signature = useMemo(
    () => groups.map((g) => `${g.id}:${g.items.map((x) => `${x.key}:${x.span}:${x.label}`).join('|')}`).join('||'),
    [groups]
  );

  useEffect(() => {
    let raf = 0;
    const scan = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGroups(readGroups()));
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { subtree: true, childList: true });
    window.addEventListener('resize', scan);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', scan);
    };
  }, []);

  useEffect(() => {
    // يعيد القراءة بعد تحديث React للحقل الذي غُيّر بالسحب.
    if (!signature) return;
    const t = setTimeout(() => setGroups(readGroups()), 60);
    return () => clearTimeout(t);
  }, [signature]);

  if (!groups.length) return null;

  return (
    <div data-resize-overlay="true" className="section formbuilder-resize-panel" style={{ marginTop: 0, marginBottom: 18 }}>
      <header>
        <h2>تصميم المساحات بالماوس</h2>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>شبكة A4 مرنة — السحب يحفظ العرض الحقيقي</span>
      </header>
      <div style={{ padding: 14 }}>
        {groups.map((group, gi) => (
          <div key={group.id} style={{ marginTop: gi ? 18 : 0 }}>
            <div style={{ fontWeight: 700, color: '#7C2B28', marginBottom: 6 }}>{group.title}</div>
            <ResizableLayoutGrid
              items={group.items}
              isTable={group.isTable}
              onResize={(index, span) => {
                const input = group.bindings[index];
                if (input) nativeSet(input, span);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
