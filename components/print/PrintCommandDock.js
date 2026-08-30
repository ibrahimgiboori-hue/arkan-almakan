'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PrintCommandDockContext = createContext(null);

export function PrintCommandDockProvider({ children }) {
  const [sections, setSections] = useState({});

  const registerSection = useCallback((key, order, node) => {
    if (!key) return;
    setSections((previous) => {
      if (!node) {
        if (!(key in previous)) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      }
      const current = previous[key];
      if (current?.order === order && current?.node === node) return previous;
      return { ...previous, [key]:{ order:Number(order || 50), node } };
    });
  }, []);

  const unregisterSection = useCallback((key) => {
    if (!key) return;
    setSections((previous) => {
      if (!(key in previous)) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, []);

  const contextValue = useMemo(() => ({ registerSection, unregisterSection }), [registerSection, unregisterSection]);
  const ordered = useMemo(
    () => Object.entries(sections)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, item]) => ({ key, ...item })),
    [sections],
  );

  return (
    <PrintCommandDockContext.Provider value={contextValue}>
      {ordered.length > 0 && (
        <div className="print-command-dock no-print" data-print-command-dock="captain">
          <div className="print-command-dock-scroll">
            {ordered.map(({ key, node }) => (
              <div className={`print-command-section print-command-section-${key}`} key={key} data-print-command-section={key}>
                {node}
              </div>
            ))}
          </div>
        </div>
      )}
      {children}

      <style jsx global>{`
        .print-command-dock{
          position:sticky;
          top:0;
          z-index:120;
          width:100%;
          padding:6px 10px;
          background:rgba(242,242,242,.97);
          border-bottom:1px solid #c7c7c7;
          box-shadow:0 3px 12px rgba(0,0,0,.10);
          direction:rtl;
          backdrop-filter:blur(5px);
        }
        .print-command-dock-scroll{
          max-width:calc(210mm + 40px);
          margin:0 auto;
          display:flex;
          align-items:center;
          gap:7px;
          overflow-x:auto;
          overflow-y:hidden;
          scrollbar-width:thin;
          padding:1px 0;
        }
        .print-command-section{
          display:flex;
          align-items:center;
          gap:6px;
          flex:0 0 auto;
          white-space:nowrap;
        }
        .print-command-section + .print-command-section{
          border-inline-start:1px solid #c8c8c8;
          padding-inline-start:7px;
        }
        .print-command-section button{
          font:inherit;
          font-size:12px;
          line-height:1.2;
          min-height:31px;
          padding:6px 9px;
          border:1px solid #aaa;
          background:#fff;
          color:#222;
          cursor:pointer;
        }
        .print-command-section button.active,
        .print-command-section button.primary{
          background:#8B3332;
          border-color:#8B3332;
          color:#fff;
        }
        .print-command-section button:disabled{opacity:.38;cursor:not-allowed}
        .print-command-section .print-command-note,
        .print-command-section .print-layout-value,
        .print-command-section .print-layout-message,
        .print-command-section .print-text-selected-label,
        .print-command-section .print-text-message{
          font-size:11.5px;
          color:#444;
        }
        .print-command-section .print-command-status{
          font-size:11.5px;
          font-weight:700;
          color:#245c31;
          padding:5px 7px;
          border:1px solid #c8d7ca;
          background:#f7fbf7;
        }
        @media(max-width:900px){
          .print-command-dock{padding-inline:5px}
          .print-command-dock-scroll{max-width:none}
        }
        @media print{.print-command-dock{display:none!important}}
      `}</style>
    </PrintCommandDockContext.Provider>
  );
}

export function usePrintCommandSection(key, node, order = 50) {
  const context = useContext(PrintCommandDockContext);

  useEffect(() => {
    if (!context) return undefined;
    context.registerSection(key, order, node);
    return () => context.unregisterSection(key);
  }, [context, key, node, order]);
}
