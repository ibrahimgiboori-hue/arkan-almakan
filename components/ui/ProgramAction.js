'use client';

import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import {
  WORK_ACTION_PLACEMENT,
  WORK_ACTION_CONSEQUENCE,
  WORK_ACTION_SCOPE,
  defineWorkAction,
} from '@/lib/work-surface-constitution';
import { useActionNervousSystem } from './ActionNervousSystemRuntime';

function cx(...values) {
  return values.filter(Boolean).join(' ');
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
  const selectionRequired = spec.actionScope === WORK_ACTION_SCOPE.SELECTION;
  const selectionReady = !selectionRequired || Number(selectionCount || 0) >= spec.minSelection;
  const selectionActionAllowed = !selectionRequired || spec.selectionActionAllowed !== false;
  const acting = nervousSystem.isActing(spec.key);
  const actionEnabled = allowed && !disabled && !acting && selectionReady && selectionActionAllowed;
  const label = children || spec.label;
  const subject = spec.subject || spec.innervationSubject || null;

  async function handleClick(event) {
    if (!actionEnabled) {
      event.preventDefault();
      return;
    }

    // الوضع القديم يبقى كما هو تمامًا حتى يختار العضو الاتصال بالعصب المركزي.
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
      aria-busy={acting ? 'true' : undefined}
      onClick={handleClick}
      title={title || spec.label}
      data-program-action="true"
      data-action-key={spec.key}
      data-action-kind={spec.kind}
      data-action-risk={spec.consequence}
      data-action-scope={spec.actionScope}
      data-action-placement={spec.placement || WORK_ACTION_PLACEMENT.ORIGIN}
      data-action-capability={spec.capability || undefined}
      data-action-consequential={consequential ? 'true' : 'false'}
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
      data-page-command-trigger={spec.commandTrigger ? 'true' : undefined}
    >
      {label}
    </button>
  );
}
