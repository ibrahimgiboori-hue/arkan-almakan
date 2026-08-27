'use client';

/**
 * RawGrid — the one shared "Excel-like" editable grid for the raw phase.
 *
 * Goal: every data-entry screen in the program (expenses, advances, leaves,
 * timesheets, quotes...) should be built from THIS component instead of
 * hand-rolling its own <table>. That gives the whole program one visual and
 * behavioral skeleton now (symmetry, consistent editing pattern), and lets
 * the whole program be "dressed" later with a single skin change in
 * raw-tokens.css / RawGrid.module.css — no per-screen rework.
 *
 * This does not invent new UX: it generalizes the pattern already used by
 * the direct-expense-panel "مصروفات اليوم" grid (editable rows, per-column
 * types, saved-vs-new styling, add/duplicate/save actions) so every other
 * screen can reuse it verbatim.
 */

import styles from './RawGrid.module.css';

function resolveOptions(options, row) {
  if (typeof options === 'function') return options(row) || [];
  return options || [];
}

function Cell({ column, row, onPatchRow, disabled }) {
  const value = row[column.key];
  const isVisible = column.visible ? column.visible(row) : true;
  const fieldClass = `${styles.field} ${column.savedStyle ? styles.fieldSaved : ''}`.trim();

  function patch(nextValue) {
    const change = column.onChange
      ? column.onChange(row, nextValue)
      : { [column.key]: nextValue };
    onPatchRow(change);
  }

  switch (column.type) {
    case 'index':
      return <td className={styles.cellIndex}>{column.render(row)}</td>;

    case 'badge': {
      const tone = column.tone ? column.tone(row) : 'muted';
      const toneClass = tone === 'saved' ? styles.badgeSaved : tone === 'new' ? styles.badgeNew : styles.badgeMuted;
      return (
        <td className={styles.cellBadge}>
          <span className={`${styles.badge} ${toneClass}`}>{column.text(row)}</span>
        </td>
      );
    }

    case 'date':
      return (
        <td>
          <input
            type="date"
            className={fieldClass}
            value={value || ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
          />
        </td>
      );

    case 'number':
      return (
        <td>
          <input
            type="number"
            className={fieldClass}
            min={column.min ?? 0}
            step={column.step ?? '0.01'}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
          />
        </td>
      );

    case 'text':
      return (
        <td style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <input
            type="text"
            className={fieldClass}
            placeholder={column.placeholder}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
          />
        </td>
      );

    case 'select': {
      if (!isVisible) {
        return (
          <td style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
            <span className={styles.fieldMuted}>{column.placeholderWhenHidden ?? '—'}</span>
          </td>
        );
      }
      const opts = resolveOptions(column.options, row);
      return (
        <td style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <select
            className={fieldClass}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
          >
            {column.emptyOption !== undefined && <option value="">{column.emptyOption}</option>}
            {opts.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </td>
      );
    }

    case 'action':
      return <td className={styles.actionCell}>{column.render(row, { disabled })}</td>;

    case 'custom':
    default:
      return <td>{column.render ? column.render(row, { disabled }) : null}</td>;
  }
}

export default function RawGrid({
  columns,
  rows,
  rowKey,
  savedFlag,
  onPatchRow,
  busy = false,
  loading = false,
  emptyMessage = 'لا توجد بيانات بعد.',
}) {
  if (loading) return <div className={styles.loading}>جارٍ التحميل…</div>;
  if (!rows?.length) return <div className={styles.empty}>{emptyMessage}</div>;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const saved = savedFlag ? savedFlag(row) : false;
            return (
              <tr key={key} className={saved ? styles.rowSaved : styles.rowNew}>
                {columns.map((column) => (
                  <Cell
                    key={column.key}
                    column={{ ...column, savedStyle: saved }}
                    row={row}
                    disabled={busy}
                    onPatchRow={(patch) => onPatchRow(key, patch)}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RawGridFooter({ actions, summary }) {
  return (
    <div className={styles.footer}>
      <div className={styles.footerActions}>{actions}</div>
      <div className={styles.footerSummary}>{summary}</div>
    </div>
  );
}

export { styles as rawGridStyles };
