'use client';
import { createContext, useContext } from 'react';

const PrintLayoutContext = createContext({
  editing:false,
  gridWeights:{},
  setGridWeights:()=>{},
});

export function PrintLayoutProvider({ value, children }) {
  return <PrintLayoutContext.Provider value={value}>{children}</PrintLayoutContext.Provider>;
}

export function usePrintLayout() {
  return useContext(PrintLayoutContext);
}
