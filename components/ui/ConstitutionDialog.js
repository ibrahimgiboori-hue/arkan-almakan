'use client';

import { useEffect, useId, useRef } from 'react';
import { uiSlot } from '@/lib/ui-skin-contract';
import styles from './constitution-dialog.module.css';

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openDialogCount = 0;
let pageOverflowBeforeDialogs = '';

function lockPageScroll() {
  if (openDialogCount === 0) {
    pageOverflowBeforeDialogs = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogCount += 1;
}

function unlockPageScroll() {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) {
    document.body.style.overflow = pageOverflowBeforeDialogs;
    pageOverflowBeforeDialogs = '';
  }
}

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    lockPageScroll();

    const timer = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector(FOCUSABLE);
      (first || dialogRef.current)?.focus?.();
    }, 0);

    function isTopmostDialog() {
      const dialogs = document.querySelectorAll('[data-constitution-dialog]');
      return dialogs.length > 0 && dialogs[dialogs.length - 1] === dialogRef.current;
    }

    function onKeyDown(event) {
      if (!isTopmostDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
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
      unlockPageScroll();
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const close = () => onCloseRef.current?.();

  return (
    <div className={styles.backdrop} data-ui-part="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        ref={dialogRef}
        className={`${styles.dialog} ${styles[`size_${size}`] || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-constitution-dialog="true"
        data-ui-slot={uiSlot('dialog')}
        data-ui-state="open"
        data-dialog-size={size}
      >
        <header className={`${styles.header} ${!showBack ? styles.headerWithoutBack : ''}`} data-ui-part="dialog-header">
          {showBack ? (
            <button type="button" className={styles.back} onClick={close} aria-label="رجوع" data-ui-control="dialog-back">
              <span aria-hidden="true">←</span>
              <span>رجوع</span>
            </button>
          ) : null}
          <div className={styles.heading} data-ui-part="dialog-heading">
            <h2 id={titleId} data-ui-part="title">{title}</h2>
            {description ? <p id={descriptionId} data-ui-part="description">{description}</p> : null}
          </div>
        </header>
        <div className={styles.body} data-ui-part="dialog-body">{children}</div>
      </section>
    </div>
  );
}
