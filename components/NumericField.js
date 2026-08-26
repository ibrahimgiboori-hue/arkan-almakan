'use client';

// حقل رقمي واحد لكل الشاشات: يحتفظ بما يكتبه المستخدم نصًا أثناء الكتابة،
// ولا يفسّره رقمًا ولا يحفظه إلا عند إنهاء التحرير (blur أو Enter).
// القاعدة نفسها في lib/numeric-input.mjs — هذا المكوّن غلاف واجهة لها فقط.

import { useEffect, useRef, useState } from 'react';
import { normalizeStoredNumber, numericDraftNeedsWrite } from '@/lib/numeric-input.mjs';

const toText = (value) => {
  const number = normalizeStoredNumber(value);
  return number === null ? '' : String(number);
};

export default function NumericField({
  value,
  onCommit,
  onInvalid,
  allowEmpty = true,
  ...inputProps
}) {
  const storedText = toText(value);
  const [draft, setDraft] = useState(storedText);
  const editing = useRef(false);

  // تحديث الخادم يظهر فورًا، إلا أثناء تحرير المستخدم لهذا الحقل تحديدًا.
  useEffect(() => {
    if (!editing.current) setDraft(storedText);
  }, [storedText]);

  function commit() {
    editing.current = false;
    const outcome = numericDraftNeedsWrite(draft, value, { allowEmpty });
    if (!outcome.valid) {
      setDraft(storedText);
      onInvalid?.(draft);
      return;
    }
    if (!outcome.write) {
      setDraft(toText(outcome.value));
      return;
    }
    setDraft(toText(outcome.value));
    onCommit?.(outcome.value);
  }

  return (
    <input
      {...inputProps}
      value={draft}
      onFocus={() => { editing.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') { editing.current = false; setDraft(storedText); event.currentTarget.blur(); }
        inputProps.onKeyDown?.(event);
      }}
    />
  );
}
