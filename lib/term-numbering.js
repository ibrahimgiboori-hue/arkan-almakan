export function nextTermNumber(value) {
  const parts = String(value || '1').split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      parts[i] = String(Number(parts[i]) + 1);
      return parts.join('-');
    }
  }
  return `${value}-1`;
}

export function resolveTermNumbers(items = [], start = '1') {
  let previous = String(start || '1').trim() || '1';
  return items.map((item, index) => {
    const manual = String(item?.number_override || '').trim();
    const number = manual || (index === 0 ? previous : nextTermNumber(previous));
    previous = number;
    return { ...item, number };
  });
}
