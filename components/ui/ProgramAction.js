'use client';

import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import {
  WORK_ACTION_PLACEMENT,
  WORK_ACTION_CONSEQUENCE,
  defineWorkAction,
} from '@/lib/work-surface-constitution';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export default function ProgramAction({
  action,
  children,
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  title,
  ...rest
}) {
  const session = useDashboardSession();
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
  const label = children || spec.label;

  function handleClick(event) {
    if (!allowed || disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event, spec);
  }

  return (
    <button
      {...rest}
      type={type}
      className={cx(className)}
      disabled={disabled || !allowed}
      onClick={handleClick}
      title={title || spec.label}
      data-program-action="true"
      data-action-key={spec.key}
      data-action-kind={spec.kind}
      data-action-risk={spec.consequence}
      data-action-placement={spec.placement || WORK_ACTION_PLACEMENT.ORIGIN}
      data-action-capability={spec.capability || undefined}
      data-action-consequential={consequential ? 'true' : 'false'}
      data-page-command-trigger={spec.commandTrigger ? 'true' : undefined}
    >
      {label}
    </button>
  );
}
