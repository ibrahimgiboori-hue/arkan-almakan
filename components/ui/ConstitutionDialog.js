'use client';

import { useEffect, useId, useRef } from 'react';
import styles from './constitution-dialog.module.css';

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function ConstitutionDialog({
  open = true,
  title,
  description,
  onClose,
  children,
  size = 'wide',
  showBack = true,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector(FOCUSABLE);
      (first || dialogRef.current)?.focus?.();
    }, 0);

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section
        ref={dialogRef}
        className={`${styles.dialog} ${styles[`size_${size}`] || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-constitution-dialog="true"
        data-dialog-size={size}
      >
        <header className={`${styles.header} ${!showBack ? styles.headerWithoutBack : ''}`}>
          {showBack ? (
            <button type="button" className={styles.back} onClick={onClose} aria-label="رجوع">
              <span aria-hidden="true">←</span>
              <span>رجوع</span>
            </button>
          ) : null}
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
