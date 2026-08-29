'use client';

import { useDashboardSession } from '@/lib/dashboard-session-context';
import {
  ACTION_PLACEMENT,
  ACTION_RISK,
  actionAllowed,
  defineInterfaceAction,
} from '@/lib/interface-constitution';

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
  const spec = defineInterfaceAction(action || {});
  const allowed = actionAllowed(spec, session);

  if (!allowed && spec.hiddenWhenUnauthorized !== false) return null;

  const consequential = spec.risk === ACTION_RISK.CONSEQUENTIAL || spec.risk === ACTION_RISK.DESTRUCTIVE;
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
      data-action-risk={spec.risk}
      data-action-placement={spec.placement || ACTION_PLACEMENT.ORIGIN}
      data-action-capability={spec.capability || undefined}
      data-action-consequential={consequential ? 'true' : 'false'}
      data-page-command-trigger={spec.commandTrigger ? 'true' : undefined}
    >
      {label}
    </button>
  );
}
