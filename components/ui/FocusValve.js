'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  FOCUS_REGION,
  FOCUS_VALVE_STATE,
  focusRegionVisible,
  normalizeFocusValveState,
} from '@/lib/focus-valve-constitution';
import styles from './FocusValve.module.css';

const FocusValveContext = createContext(null);

export function useFocusValve() {
  return useContext(FocusValveContext);
}

export function FocusValve({ state = FOCUS_VALVE_STATE.READY, entity = null, stage = null, children }) {
  const normalizedState = normalizeFocusValveState(state);
  const value = useMemo(() => Object.freeze({
    state:normalizedState,
    entity,
    stage:stage || null,
    focused:normalizedState !== FOCUS_VALVE_STATE.READY,
  }), [entity, normalizedState, stage]);

  return (
    <FocusValveContext.Provider value={value}>
      <div
        className={styles.valve}
        data-focus-valve="work-focus-valve-v1"
        data-focus-valve-state={normalizedState}
        data-focus-entity-type={entity?.type || undefined}
        data-focus-entity-id={entity?.id || undefined}
        data-focus-entity-stage={stage || undefined}
      >
        {children}
      </div>
    </FocusValveContext.Provider>
  );
}

export function FocusRegion({ region, children, className = '' }) {
  const valve = useFocusValve();
  const visible = focusRegionVisible(valve?.state, region);
  return (
    <div
      className={[styles.region,className].filter(Boolean).join(' ')}
      data-focus-region={region}
      hidden={!visible}
      aria-hidden={visible ? undefined : 'true'}
    >
      {children}
    </div>
  );
}

export function FocusReady({ children, className = '' }) {
  return <FocusRegion region={FOCUS_REGION.READY} className={className}>{children}</FocusRegion>;
}

export function FocusRegister({ children, className = '' }) {
  return <FocusRegion region={FOCUS_REGION.REGISTER} className={className}>{children}</FocusRegion>;
}

export function FocusWork({ children, className = '' }) {
  return <FocusRegion region={FOCUS_REGION.WORK} className={className}>{children}</FocusRegion>;
}

export function FocusContextLine({ title, meta = [], actions = null }) {
  const cleanMeta = (Array.isArray(meta) ? meta : [meta]).filter(Boolean);
  return (
    <div className={styles.contextLine} data-focus-context-line="true">
      <div className={styles.contextText}>
        <strong>{title}</strong>
        {cleanMeta.length ? (
          <div className={styles.contextMeta}>
            {cleanMeta.map((item,index)=><span key={`${item}-${index}`}>{item}</span>)}
          </div>
        ) : null}
      </div>
      {actions ? <div className={styles.contextActions}>{actions}</div> : null}
    </div>
  );
}
