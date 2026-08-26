'use client';

import { useEffect, useRef } from 'react';
import styles from './constitution-dialog.module.css';

export default function ConstitutionDialog({
  open = true,
  title,
  description,
  onClose,
  children,
  size = 'wide',
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section
        ref={dialogRef}
        className={`${styles.dialog} ${styles[`size_${size}`] || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="constitution-dialog-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id="constitution-dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
