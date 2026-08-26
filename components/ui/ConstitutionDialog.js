'use client';

import { useEffect, useId, useRef } from 'react';
import styles from './constitution-dialog.module.css';

// الحوارات قد تتراكب (تأكيد فوق حوار إدارة). حفظ/استرجاع overflow لكل حوار
// على حدة يترك الصفحة مقفلة عن التمرير عندما يُغلق حواران في نفس اللحظة،
// لأن ترتيب تنظيف React قد يعيد القيمة القديمة بعد الجديدة. العدّاد يجعل
// القفل ملكًا للمجموعة كلها: يُفك عند إغلاق آخر حوار فقط.
let openDialogCount = 0;
let overflowBeforeFirstDialog = '';

function lockPageScroll() {
  if (openDialogCount === 0) {
    overflowBeforeFirstDialog = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogCount += 1;
}

function unlockPageScroll() {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) document.body.style.overflow = overflowBeforeFirstDialog;
}

export default function ConstitutionDialog({
  open = true,
  title,
  description,
  onClose,
  children,
  size = 'wide',
}) {
  const dialogRef = useRef(null);
  // معرّف فريد لكل حوار: المعرّف الثابت كان يُنتج id مكرر في DOM عند التراكب.
  const titleId = useId();

  // onClose يُمرَّر غالبًا كدالة سهمية داخل JSX، فتتغيّر مرجعيتها كل رسم.
  // إبقاؤها في deps كان يعيد تشغيل الأثر (وقفل/فك التمرير) مع كل إعادة رسم.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    lockPageScroll();
    // الحوار الأعلى وحده يستجيب لـEscape، حتى لا يُغلق حوار التأكيد وما تحته معًا.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const stack = document.querySelectorAll('[data-constitution-dialog]');
      if (stack.length && stack[stack.length - 1] !== dialogRef.current) return;
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      unlockPageScroll();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
        aria-labelledby={titleId}
        tabIndex={-1}
        data-constitution-dialog=""
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
