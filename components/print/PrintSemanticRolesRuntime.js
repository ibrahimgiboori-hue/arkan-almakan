'use client';

import { useEffect } from 'react';

export const PRINT_SEMANTIC_ROLE = Object.freeze({
  TITLE_ROW:'title-row',
  CONSTANT_COLUMN:'constant-column',
});

export const PRINT_SEMANTIC_STYLE = Object.freeze({
  [PRINT_SEMANTIC_ROLE.TITLE_ROW]:Object.freeze({
    textVar:'--captain-title-row-text',
    fillVar:'--captain-title-row-fill',
    defaultText:'#ffffff',
    defaultFill:'#7d1f2f',
  }),
  [PRINT_SEMANTIC_ROLE.CONSTANT_COLUMN]:Object.freeze({
    textVar:'--captain-constant-column-text',
    fillVar:'--captain-constant-column-fill',
    defaultText:'#444444',
    defaultFill:'#ffffff',
  }),
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
  if (element.dataset.printSemantic!==role) element.dataset.printSemantic=role;
  if (element.dataset.printSemanticSource!==source) element.dataset.printSemanticSource=source;
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
    if (scope.dataset.printSemanticSchema!=='title-row|constant-column') {
      scope.dataset.printSemanticSchema='title-row|constant-column';
    }
  });
}

function manualStyleForRole(root,role) {
  const candidates=[...root.querySelectorAll(
    `[data-print-semantic="${role}"][data-print-workbench-style="true"],`+
    `[data-print-semantic="${role}"][data-print-manual-color="semantic-role"]`
  )];
  for (const element of candidates) {
    const text=element.style.getPropertyValue('color').trim();
    const fill=element.style.getPropertyValue('background-color').trim();
    if (text || fill) return { text:text||null, fill:fill||null };
  }
  return null;
}

function setRootVariable(name,value) {
  const root=document.documentElement;
  const current=root.style.getPropertyValue(name).trim();
  if (value) {
    if (current!==value) root.style.setProperty(name,value);
  } else if (current) {
    root.style.removeProperty(name);
  }
}

function setImportant(element,property,value) {
  if (!element || !value) return;
  const current=element.style.getPropertyValue(property).trim();
  const priority=element.style.getPropertyPriority(property);
  if (current===value && priority==='important') return;
  element.style.setProperty(property,value,'important');
}

function enforceRoleStyle(root,role,style) {
  const text=style.text||style.defaultText;
  const fill=style.fill||style.defaultFill;
  [...root.querySelectorAll(`[data-print-semantic="${role}"]`)].forEach((element)=>{
    setImportant(element,'color',text);
    setImportant(element,'background-color',fill);
    if (element.dataset.printSemanticAuthority!=='captain') element.dataset.printSemanticAuthority='captain';
    [...element.querySelectorAll('*')].forEach((child)=>setImportant(child,'color','inherit'));
  });
}

export function applyPrintSemanticAuthority(root=document) {
  Object.entries(PRINT_SEMANTIC_STYLE).forEach(([role,definition])=>{
    const manual=manualStyleForRole(root,role);
    setRootVariable(definition.textVar,manual?.text||null);
    setRootVariable(definition.fillVar,manual?.fill||null);
    enforceRoleStyle(root,role,{
      ...definition,
      text:manual?.text||null,
      fill:manual?.fill||null,
    });
  });
}

export function reconcilePrintSemantics(root=document) {
  applyPrintSemanticRoles(root);
  applyPrintSemanticAuthority(root);
}

export default function PrintSemanticRolesRuntime() {
  useEffect(()=>{
    let frame=0;
    const schedule=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>reconcilePrintSemantics(document));
    };
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{
      subtree:true,
      childList:true,
      attributes:true,
      attributeFilter:['style','data-print-semantic','data-print-workbench-style','data-print-manual-color'],
    });
    return ()=>{
      cancelAnimationFrame(frame);
      observer.disconnect();
      Object.values(PRINT_SEMANTIC_STYLE).forEach((definition)=>{
        document.documentElement.style.removeProperty(definition.textVar);
        document.documentElement.style.removeProperty(definition.fillVar);
      });
    };
  },[]);
  return null;
}
