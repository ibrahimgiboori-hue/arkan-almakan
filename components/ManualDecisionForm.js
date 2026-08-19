'use client';
import { useMemo, useState } from 'react';
import { personLabel } from '@/lib/people';

function todayLocal() {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

export default function ManualDecisionForm({
  requestLabel,
  stageLabel,
  employees,
  onSubmit,
  onClose,
  busy = false,
}) {
  const [actorEmployeeId, setActorEmployeeId] = useState('');
  const [decision, setDecision] = useState('approved');
  const [decisionDate, setDecisionDate] = useState(todayLocal());
  const [comment, setComment] = useState('');

  const orderedEmployees = useMemo(() => {
    return [...(employees || [])].sort((a, b) =>
      (a.full_name_ar || '').localeCompare(b.full_name_ar || '', 'ar')
    );
  }, [employees]);

  async function submit(e) {
    e.preventDefault();
    if (!actorEmployeeId) return;
    await onSubmit({
      actorEmployeeId,
      decision,
      decisionDate,
      comment: comment.trim() || null,
    });
  }

  return (
    <div className="section" style={{ marginTop: 0, marginBottom: 18 }}>
      <header>
        <div>
          <h2>تسجيل القرار</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
            {requestLabel}{stageLabel ? ` - ${stageLabel}` : ''}
          </p>
        </div>
      </header>

      <form onSubmit={submit} style={{ padding: 18 }}>
        <div style={{
          marginBottom: 16,
          padding: '11px 13px',
          border: '1px solid var(--line)',
          borderRadius: 8,
          background: 'var(--paper, #fff)',
          color: 'var(--ink-soft)',
          fontSize: 13,
          lineHeight: 1.8,
        }}>
          اختر الشخص الذي اتخذ القرار فعليًا. سيحفظ النظام تلقائيًا مستخدم البرنامج الذي قام بتسجيل هذا القرار بصورة مستقلة.
        </div>

        <div className="form-grid">
          <div className="field">
            <label>صاحب القرار *</label>
            <select
              required
              value={actorEmployeeId}
              onChange={(e) => setActorEmployeeId(e.target.value)}
            >
              <option value="">اختر الشخص</option>
              {orderedEmployees.map((person) => (
                <option key={person.id} value={person.id}>{personLabel(person)}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>القرار *</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="approved">اعتماد</option>
              <option value="rejected">رفض</option>
            </select>
          </div>

          <div className="field">
            <label>تاريخ القرار *</label>
            <input
              type="date"
              dir="ltr"
              required
              value={decisionDate}
              onChange={(e) => setDecisionDate(e.target.value)}
            />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات</label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="اختياري"
            />
          </div>
        </div>

        <div className="rowsplit">
          <button className="btn" type="submit" disabled={busy || !actorEmployeeId}>
            {busy ? 'جارٍ التسجيل' : 'تسجيل القرار'}
          </button>
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
