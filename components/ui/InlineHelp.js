'use client';

import { useState } from 'react';

export default function InlineHelp({ text, label = 'شرح الحقل' }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginInlineStart: 6, verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '1px solid var(--line, #8b8175)',
          background: 'transparent',
          color: 'inherit',
          padding: 0,
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 800,
          cursor: 'help',
        }}
      >
        ?
      </button>
      {open ? (
        <span
          role="note"
          style={{
            position: 'absolute',
            zIndex: 80,
            insetInlineStart: 0,
            top: 24,
            minWidth: 220,
            maxWidth: 320,
            padding: '8px 10px',
            border: '1px solid var(--line, #d1d5db)',
            borderRadius: 8,
            background: 'var(--raw-paper, #fff)',
            color: 'var(--raw-ink, #2f2924)',
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.6,
            whiteSpace: 'normal',
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
