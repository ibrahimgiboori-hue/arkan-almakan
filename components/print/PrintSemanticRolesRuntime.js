'use client';

import { useEffect } from 'react';

export const PRINT_SEMANTIC_ROLE = Object.freeze({
  TITLE_ROW:'title-row',
  CONSTANT_COLUMN:'constant-column',
});

const PRINT_SCOPE_SELECTOR = '.document-content-body';
const EXPLICIT_TITLE_SELECTOR = '[data-print-role="title-row"],[data-print-semantic="title-row"]';
const EXPLICIT_CONSTANT_SELECTOR = '[data-print-role="constant-column"],[data-print-semantic="constant-column"]';

const LEGACY_TITLE_SELECTORS = [
  'thead',
  '[data-print-header="true"]',
  '.card-head',
  '.pc-head',
  '.pt-head',
  '.dc-head',
  '.report-items-title',
  '.strict > .head',
];

const LEGACY_CONSTANT_SELECTORS = [
  '.card-doc .k',
  '.pc-k',
  '.pt-k',
  '.governed-cell-label',
  '[data-field-label="true"]',
  '.field-label',
  '.label-cell',
  'dt',
];

function mark(element,role,source='captain') {
  if (!element || element.dataset.printSemanticLocked==='true') return;
  element.dataset.printSemantic=role;
  element.dataset.printSemanticSource=source;
}

function markTitleStructure(element,source='captain') {
  if (!element) return;
  const tag=element.tagName;

  if (tag==='THEAD') {
    [...element.querySelectorAll(':scope > tr')].forEach((row)=>markTitleStructure(row,source));
    return;
  }

  if (tag==='TR') {
    mark(element,PRINT_SEMANTIC_ROLE.TITLE_ROW,source);
    [...element.children]
      .filter((cell)=>['TH','TD'].includes(cell.tagName))
      .forEach((cell)=>mark(cell,PRINT_SEMANTIC_ROLE.TITLE_ROW,source));
    return;
  }

  if (['TH','TD'].includes(tag) && element.closest('thead')) {
    const row=element.closest('tr');
    if (row) markTitleStructure(row,source);
    else mark(element,PRINT_SEMANTIC_ROLE.TITLE_ROW,source);
    return;
  }

  mark(element,PRINT_SEMANTIC_ROLE.TITLE_ROW,source);
}

function inferKeyValueTables(scope) {
  const tables=[...scope.querySelectorAll('table')];
  tables.forEach((table)=>{
    if (table.matches('[data-print-flow="repeatable-table"],.amounts,.sigtable')) return;
    const rows=[...table.querySelectorAll(':scope > tbody > tr')];
    if (!rows.length) return;
    const valid=rows.filter((row)=>{
      const cells=[...row.children].filter((cell)=>['TD','TH'].includes(cell.tagName));
      return cells.length===2;
    });
    if (valid.length<Math.min(2,rows.length)) return;
    valid.forEach((row)=>{
      const first=[...row.children].find((cell)=>['TD','TH'].includes(cell.tagName));
      if (first && !first.dataset.printSemantic) mark(first,PRINT_SEMANTIC_ROLE.CONSTANT_COLUMN,'captain-inference');
    });
  });
}

export function applyPrintSemanticRoles(root=document) {
  const scopes=[...root.querySelectorAll(PRINT_SCOPE_SELECTOR)];
  scopes.forEach((scope)=>{
    [...scope.querySelectorAll(EXPLICIT_TITLE_SELECTOR)].forEach((element)=>markTitleStructure(element,'explicit'));
    [...scope.querySelectorAll(EXPLICIT_CONSTANT_SELECTOR)].forEach((element)=>mark(element,PRINT_SEMANTIC_ROLE.CONSTANT_COLUMN,'explicit'));

    LEGACY_TITLE_SELECTORS.forEach((selector)=>{
      [...scope.querySelectorAll(selector)].forEach((element)=>markTitleStructure(element,'captain-fallback'));
    });

    LEGACY_CONSTANT_SELECTORS.forEach((selector)=>{
      [...scope.querySelectorAll(selector)].forEach((element)=>{
        if (!element.dataset.printSemantic) mark(element,PRINT_SEMANTIC_ROLE.CONSTANT_COLUMN,'captain-fallback');
      });
    });

    inferKeyValueTables(scope);
    scope.dataset.printSemanticSchema='title-row|constant-column';
  });
}

export default function PrintSemanticRolesRuntime() {
  useEffect(()=>{
    let frame=0;
    const schedule=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>applyPrintSemanticRoles(document));
    };
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    return ()=>{
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  },[]);
  return null;
}
