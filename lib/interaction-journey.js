// محرك استمرارية التفاعل: السلوك المكاني موحّد، والصفحات تعلن فقط عن سطح العمل ونقطة العودة.

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function comfortTop() {
  if (typeof window === 'undefined') return 96;
  return Math.max(88, Math.min(150, Math.round(window.innerHeight * 0.14)));
}

export function focusContextualWorkSurface(element, options = {}) {
  if (!element || typeof window === 'undefined') return;
  const { focusSelector = null } = options;
  requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const targetTop = comfortTop();
    const tooHigh = rect.top < 72;
    const tooLow = rect.top > window.innerHeight * 0.38;
    const mostlyBelow = rect.bottom > window.innerHeight && rect.top > targetTop;

    if (tooHigh || tooLow || mostlyBelow) {
      window.scrollBy({
        top: rect.top - targetTop,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }

    const requestedField = focusSelector ? element.querySelector(focusSelector) : null;
    const target = requestedField || element;
    try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
  });
}

export function restoreInteractionOrigin(originId) {
  if (!originId || typeof document === 'undefined' || typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    const element = document.getElementById(originId);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < 72 || rect.bottom > window.innerHeight - 48) {
      element.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    try { element.focus({ preventScroll: true }); } catch { element.focus?.(); }
  });
}

export function focusFirstInvalidField(surface) {
  if (!surface) return false;
  const field = surface.querySelector(':invalid, [aria-invalid="true"], [data-work-invalid="true"]');
  if (!field) {
    focusContextualWorkSurface(surface);
    return false;
  }
  requestAnimationFrame(() => {
    field.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    field.focus?.({ preventScroll: true });
  });
  return true;
}

export function contextualEscape(event, close) {
  if (event.key !== 'Escape' || event.defaultPrevented || typeof close !== 'function') return;
  const tag = event.target?.tagName?.toLowerCase?.();
  if (tag === 'select') return;
  event.preventDefault();
  close();
}
