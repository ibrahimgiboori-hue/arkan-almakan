'use client';

import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import { uiSlot } from '@/lib/ui-skin-contract';
import {
  WORK_ACTION_KIND,
  WORK_ACTION_PLACEMENT,
  WORK_ACTION_CONSEQUENCE,
  WORK_ACTION_SCOPE,
  defineWorkAction,
} from '@/lib/work-surface-constitution';
import { useActionNervousSystem } from './ActionNervousSystemRuntime';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function disabledReason({ allowed, disabled, acting, selectionRequired, selectionReady, selectionActionAllowed, minSelection }) {
  if (!allowed) return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  if (acting) return 'الإجراء قيد التنفيذ الآن.';
  if (selectionRequired && !selectionReady) return `حدد ${Math.max(1, Number(minSelection || 1))} سجل على الأقل لتنفيذ الإجراء.`;
  if (selectionRequired && !selectionActionAllowed) return 'هذا الإجراء غير مسموح على مجموعة السجلات المحددة.';
  if (disabled) return 'الإجراء غير متاح حاليًا.';
  return '';
}

function destructiveConfirmation(spec) {
  if (spec.confirmation === false) return null;
  if (typeof spec.confirmation === 'string' && spec.confirmation.trim()) return spec.confirmation.trim();
  return `هل تريد تنفيذ «${spec.label}»؟ هذا الإجراء قد يغيّر أو يحذف بيانات ولا يمكن التراجع عنه تلقائيًا.`;
}

export default function ProgramAction({
  action,
  children,
  className = '',
  disabled = false,
  selectionCount = 0,
  onClick,
  execute = null,
  onResult = null,
  type = 'button',
  title,
  ...rest
}) {
  const session = useDashboardSession();
  const nervousSystem = useActionNervousSystem();
  const input = action || {};
  const spec = defineWorkAction({
    ...input,
    consequence:input.consequence || input.risk,
  });
  const allowed = !spec.capability || canUseCapability(
    session,
    spec.capability,
    spec.scopeType || 'all',
    spec.scopeKey || null,
  );

  if (!allowed && spec.hiddenWhenUnauthorized !== false) return null;

  const consequential = spec.consequence === WORK_ACTION_CONSEQUENCE.CONSEQUENTIAL || spec.consequence === WORK_ACTION_CONSEQUENCE.DESTRUCTIVE;
  const destructive = spec.consequence === WORK_ACTION_CONSEQUENCE.DESTRUCTIVE;
  const selectionRequired = spec.actionScope === WORK_ACTION_SCOPE.SELECTION;
  const selectionReady = !selectionRequired || Number(selectionCount || 0) >= spec.minSelection;
  const selectionActionAllowed = !selectionRequired || spec.selectionActionAllowed !== false;
  const acting = nervousSystem.isActing(spec.key);
  const actionEnabled = allowed && !disabled && !acting && selectionReady && selectionActionAllowed;
  const whyDisabled = disabledReason({
    allowed,
    disabled,
    acting,
    selectionRequired,
    selectionReady,
    selectionActionAllowed,
    minSelection:spec.minSelection,
  });
  const label = children || spec.label;
  const subject = spec.subject || spec.innervationSubject || null;
  const saveShortcut = spec.kind === WORK_ACTION_KIND.SAVE ? 'Control+S Meta+S' : undefined;

  async function handleClick(event) {
    if (!actionEnabled) {
      event.preventDefault();
      return;
    }

    if (typeof execute === 'function' && destructive) {
      const message = destructiveConfirmation(spec);
      if (message && !window.confirm(message)) {
        event.preventDefault();
        return;
      }
    }

    if (typeof execute !== 'function') {
      onClick?.(event, spec);
      return;
    }

    onClick?.(event, spec);
    const result = await nervousSystem.run(
      { key:spec.key, label:spec.label, subject },
      () => execute(spec),
    );
    onResult?.(result, spec);
  }

  return (
    <button
      {...rest}
      type={type}
      className={cx(className)}
      disabled={!actionEnabled}
      aria-disabled={!actionEnabled ? 'true' : undefined}
      aria-busy={acting ? 'true' : undefined}
      aria-keyshortcuts={saveShortcut}
      onClick={handleClick}
      title={title || whyDisabled || spec.label}
      data-ui-slot={uiSlot('action')}
      data-ui-control="action"
      data-ui-state={acting ? 'acting' : actionEnabled ? 'ready' : 'disabled'}
      data-program-action="true"
      data-action-key={spec.key}
      data-action-kind={spec.kind}
      data-action-risk={spec.consequence}
      data-action-scope={spec.actionScope}
      data-action-placement={spec.placement || WORK_ACTION_PLACEMENT.ORIGIN}
      data-action-capability={spec.capability || undefined}
      data-action-consequential={consequential ? 'true' : 'false'}
      data-action-destructive={destructive ? 'true' : 'false'}
      data-action-nervous-system={typeof execute === 'function' ? 'connected' : 'legacy-pass-through'}
      data-action-signal={acting ? 'acting' : 'ready'}
      data-action-entity-type={subject?.entityType || subject?.type || undefined}
      data-action-entity-id={subject?.entityId || subject?.id || undefined}
      data-action-stage={subject?.stageKey || subject?.stage || undefined}
      data-selection-required={selectionRequired ? 'true' : undefined}
      data-selection-count={selectionRequired ? Number(selectionCount || 0) : undefined}
      data-selection-profile={selectionRequired ? spec.selectionProfile : undefined}
      data-selection-kind-allowed={selectionRequired ? String(spec.selectionKindAllowed !== false) : undefined}
      data-bulk-decision-allowed={selectionRequired ? String(spec.bulkDecisionAllowed !== false) : undefined}
      data-disabled-reason={!actionEnabled && whyDisabled ? whyDisabled : undefined}
      data-page-command-trigger={spec.commandTrigger ? 'true' : undefined}
    >
      {label}
    </button>
  );
}
