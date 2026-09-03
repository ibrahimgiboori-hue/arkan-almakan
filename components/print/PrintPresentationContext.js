'use client';

import { createContext, useContext } from 'react';

const PrintPresentationContext = createContext(Object.freeze({
  labels:Object.freeze({}),
  editing:false,
}));

export function PrintPresentationProvider({ value, children }) {
  return <PrintPresentationContext.Provider value={value}>{children}</PrintPresentationContext.Provider>;
}

export function usePrintPresentation() {
  return useContext(PrintPresentationContext);
}

export function PrintColumnLabel({ field, fallback = '' }) {
  const presentation = usePrintPresentation();
  return presentation?.labels?.[field] || fallback || field;
}
