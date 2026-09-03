'use client';

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isWorkZoneContext, resolveWorkThreshold, WORK_POSTURE } from '@/lib/work-threshold-constitution';

const WorkThresholdContext = createContext(null);

export function useWorkThreshold() {
  return useContext(WorkThresholdContext);
}

function setOptionalAttribute(node, name, value) {
  if (!node) return;
  if (value === null || value === undefined || value === '') node.removeAttribute(name);
  else node.setAttribute(name, String(value));
}

export function WorkThresholdMarker() {
  const threshold = useWorkThreshold();
  if (!isWorkZoneContext(threshold)) return null;
  return (
    <div className="appWorkThresholdLine" data-work-threshold-marker="true" aria-label="سياق منطقة العمل">
      <span className="appWorkThresholdZone">{threshold.zoneLabel}</span>
      {threshold.functionLabel ? <span className="appWorkThresholdFunction">{threshold.functionLabel}</span> : null}
    </div>
  );
}

export default function WorkThresholdRuntime({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams?.toString() || '';
  const context = useMemo(() => resolveWorkThreshold(pathname, searchParams), [pathname, queryKey, searchParams]);
  const previousZoneRef = useRef(null);

  useEffect(() => {
    const shell = document.querySelector('.rawDashboardShell');
    const stage = document.querySelector('.appBodyStage');
    if (!shell || !stage) return undefined;

    shell.setAttribute('data-work-threshold', 'work-threshold-v1');
    shell.setAttribute('data-work-posture', context.posture);
    stage.setAttribute('data-work-posture', context.posture);
    setOptionalAttribute(shell, 'data-work-zone-key', context.zoneKey);
    setOptionalAttribute(shell, 'data-work-zone-label', context.zoneLabel);
    setOptionalAttribute(shell, 'data-work-function-label', context.functionLabel);

    const enteringZone = context.posture === WORK_POSTURE.WORK_ZONE
      && context.zoneKey
      && previousZoneRef.current !== context.zoneKey;

    let timer = null;
    if (enteringZone) {
      stage.setAttribute('data-work-threshold-entry', 'true');
      timer = window.setTimeout(() => stage.removeAttribute('data-work-threshold-entry'), 210);
    }
    previousZoneRef.current = context.zoneKey || null;

    return () => {
      if (timer) window.clearTimeout(timer);
      stage.removeAttribute('data-work-threshold-entry');
    };
  }, [context]);

  return (
    <WorkThresholdContext.Provider value={context}>
      {children}
    </WorkThresholdContext.Provider>
  );
}
