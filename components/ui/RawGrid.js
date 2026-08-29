'use client';

/**
 * RawGrid — الدفتر الجدولي المشترك.
 * الصفحة تصف الأعمدة ومعانيها فقط؛ المحرك يقرر سلوك الخلية والتنقل والحالة.
 */

import styles from './RawGrid.module.css';

function resolveOptions(options, row) {
  if (typeof options === 'function') return options(row) || [];
  return options || [];
}

function fieldMeta(column, rowIndex) {
  return {
    'data-grid-field':'true',
    'data-grid-row':String(rowIndex),
    'data-grid-column':String(column.key),
    'data-cell-type':column.type || 'custom',
  };
}

function Cell({ column, row, rowIndex, onPatchRow, disabled }) {
  const value = row[column.key];
  const isVisible = column.visible ? column.visible(row) : true;
  const fieldClass = `${styles.field} ${column.savedStyle ? styles.fieldSaved : ''}`.trim();
  const meta = fieldMeta(column, rowIndex);

  function patch(nextValue) {
    const change = column.onChange
      ? column.onChange(row, nextValue)
      : { [column.key]: nextValue };
    onPatchRow(change);
  }

  function commit(event) {
    if (typeof column.onCommit === 'function') column.onCommit(row, event.target.value);
  }

  switch (column.type) {
    case 'index':
      return <td className={styles.cellIndex} data-cell-type="index">{column.render(row)}</td>;

    case 'badge': {
      const tone = column.tone ? column.tone(row) : 'muted';
      const toneClass = tone === 'saved' ? styles.badgeSaved : tone === 'new' ? styles.badgeNew : styles.badgeMuted;
      return (
        <td className={styles.cellBadge} data-cell-type="badge">
          <span className={`${styles.badge} ${toneClass}`}>{column.text(row)}</span>
        </td>
      );
    }

    case 'date':
      return (
        <td data-cell-type="date">
          <input {...meta} type="date" className={fieldClass} value={value || ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit} />
        </td>
      );

    case 'money':
    case 'number':
      return (
        <td data-cell-type={column.type}>
          <input
            {...meta}
            type="number"
            inputMode="decimal"
            className={fieldClass}
            min={column.min ?? 0}
            step={column.step ?? '0.01'}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
            onBlur={commit}
          />
        </td>
      );

    case 'multiline':
      return (
        <td data-cell-type="multiline" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <textarea
            {...meta}
            data-grid-enter-moves="false"
            className={fieldClass}
            rows={column.rows || 2}
            placeholder={column.placeholder}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => patch(e.target.value)}
            onBlur={commit}
          />
        </td>
      );

    case 'text':
      return (
        <td data-cell-type="text" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <input {...meta} type="text" className={fieldClass} placeholder={column.placeholder} value={value ?? ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit} />
        </td>
      );

    case 'select': {
      if (!isVisible) {
        return (
          <td data-cell-type="select" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
            <span className={styles.fieldMuted}>{column.placeholderWhenHidden ?? '—'}</span>
          </td>
        );
      }
      const opts = resolveOptions(column.options, row);
      return (
        <td data-cell-type="select" style={column.minWidth ? { minWidth: column.minWidth } : undefined}>
          <select {...meta} className={fieldClass} value={value ?? ''} disabled={disabled} onChange={(e) => patch(e.target.value)} onBlur={commit}>
            {column.emptyOption !== undefined && <option value="">{column.emptyOption}</option>}
            {opts.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </td>
      );
    }

    case 'action':
      return <td className={styles.actionCell} data-cell-type="action">{column.render(row, { disabled })}</td>;

    case 'custom':
    default:
      return <td data-cell-type={column.type || 'custom'}>{column.render ? column.render(row, { disabled }) : null}</td>;
  }
}

function moveVertical(table, target, delta) {
  const row = Number(target.getAttribute('data-grid-row'));
  const column = target.getAttribute('data-grid-column');
  if (!Number.isInteger(row) || !column) return false;
  const next = table.querySelector(`[data-grid-field="true"][data-grid-row="${row + delta}"][data-grid-column="${CSS.escape(column)}"]`);
  if (!next || next.disabled) return false;
  next.focus();
  if (typeof next.select === 'function' && next.tagName.toLowerCase() === 'input' && next.type === 'text') next.select();
  return true;
}

export default function RawGrid({
  columns,
  rows,
  rowKey,
  savedFlag,
  onPatchRow,
  rowDisabled,
  busy = false,
  loading = false,
  emptyMessage = 'لا توجد بيانات بعد.',
}) {
  if (loading) return <div className={styles.loading}>جارٍ التحميل…</div>;
  if (!rows?.length) return <div className={styles.empty}>{emptyMessage}</div>;

  function keyDown(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('data-grid-field') !== 'true') return;
    if (event.key !== 'Enter' || target.getAttribute('data-grid-enter-moves') === 'false') return;
    if (target.tagName.toLowerCase() === 'select' && !event.shiftKey) return;
    if (moveVertical(event.currentTarget, target, event.shiftKey ? -1 : 1)) event.preventDefault();
  }

  return (
    <div className={styles.wrap} data-work-ledger="true" data-ledger-behavior="semantic-grid" data-keyboard-policy="enter-tab-native">
      <table className={styles.table} onKeyDown={keyDown}>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key} data-column-type={column.type || 'custom'} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = rowKey(row);
            const saved = savedFlag ? savedFlag(row) : false;
            const disabled = busy || Boolean(rowDisabled?.(row));
            return (
              <tr key={key} className={saved ? styles.rowSaved : styles.rowNew} data-record-row="true" data-row-disabled={disabled ? 'true' : 'false'}>
                {columns.map((column) => (
                  <Cell key={column.key} column={{ ...column, savedStyle: saved }} row={row} rowIndex={rowIndex} disabled={disabled} onPatchRow={(patch) => onPatchRow(key, patch)} />
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
    <div className={styles.footer} data-work-dock="true">
      <div className={styles.footerActions} data-work-dock-actions="true">{actions}</div>
      <div className={styles.footerSummary} data-work-dock-summary="true">{summary}</div>
    </div>
  );
}

export { styles as rawGridStyles };
