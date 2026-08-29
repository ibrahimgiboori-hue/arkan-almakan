// مجموعة السجلات المحددة هي نطاق عمل مؤقت، وليست بيانات أعمال مستقلة.
// لا نحفظها في localStorage ولا نسمح لها بتغيير أي سجل وحدها.

export function normalizeRecordSelection(value) {
  if (value == null) return [];
  const raw = value instanceof Set
    ? [...value]
    : Array.isArray(value)
      ? value
      : String(value).split(',');
  return [...new Set(raw.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function recordSelectionSet(value) {
  return new Set(normalizeRecordSelection(value));
}

export function selectionQueryValue(value) {
  return normalizeRecordSelection(value).join(',');
}

export function appendSelectionToUrl(url, value, param = 'selected') {
  const ids = normalizeRecordSelection(value);
  if (!ids.length) return String(url || '');
  const input = String(url || '');
  const separator = input.includes('?') ? '&' : '?';
  return `${input}${separator}${encodeURIComponent(param)}=${encodeURIComponent(ids.join(','))}`;
}

export function filterBySelection(rows, value, key = 'id') {
  const ids = recordSelectionSet(value);
  if (!ids.size) return rows || [];
  return (rows || []).filter((row) => ids.has(String(typeof key === 'function' ? key(row) : row?.[key])));
}

export function selectionState(rows, value, { key = 'id', selectable = () => true } = {}) {
  const selected = recordSelectionSet(value);
  const visibleSelectable = (rows || []).filter((row) => selectable(row));
  const visibleKeys = visibleSelectable.map((row) => String(typeof key === 'function' ? key(row) : row?.[key]));
  const selectedVisibleCount = visibleKeys.filter((id) => selected.has(id)).length;
  return {
    selected,
    visibleSelectable,
    visibleKeys,
    selectedVisibleCount,
    allVisibleSelected: visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length,
    someVisibleSelected: selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length,
  };
}
