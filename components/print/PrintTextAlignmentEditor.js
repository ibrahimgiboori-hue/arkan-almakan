'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  PRINT_TEXT_ALIGNMENT_OPTIONS,
  PRINT_TEXT_GOVERNANCE_VERSION,
  normalizePrintTextAlignment,
  printTextInstanceStorageKey,
} from '@/lib/print-text-governance';
import { usePrintCommandSection } from '@/components/print/PrintCommandDock';

const AUTO_SELECTOR = [
  '[data-print-text-key]',
  '.print-prose',
  '.letter-body',
  '.dc-body',
  '.q-intro',
  '.q-closing',
  '.q-term-flow > h3',
  '.q-term-flow > p',
  '.print-approval-declaration',
  '.ltr-subject',
  '.ltr-to',
  '.ltr-salut',
  '.title-block h1',
  '.q-title h1',
  '.qb-head',
  '.pc-head',
  '.card-head',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
].join(',');

function shortClassName(element) {
  return [...(element?.classList || [])]
    .find((name) => !name.startsWith('print-') && !name.startsWith('constitution-'))
    || [...(element?.classList || [])][0]
    || 'text';
}

function safeToken(value) {
  return String(value || 'text').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function isVisibleTextCandidate(element, root) {
  if (!element || !root?.contains(element)) return false;
  if (element.closest('.no-print,.print-command-dock,[data-print-text-ignore="true"]')) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  if (!String(element.textContent || '').trim()) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function governedCandidates(root) {
  if (!root) return [];
  const raw = [...root.querySelectorAll(AUTO_SELECTOR)].filter((element) => isVisibleTextCandidate(element, root));
  const set = new Set(raw);
  return raw.filter((element) => {
    if (element.hasAttribute('data-print-text-key')) return true;
    let parent = element.parentElement;
    while (parent && parent !== root) {
      if (set.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

function indexAmong(root, selector, element) {
  return [...root.querySelectorAll(selector)].filter((item) => isVisibleTextCandidate(item, root)).indexOf(element);
}

function semanticKey(root, element, candidates) {
  const blockId = element.closest('[data-block]')?.dataset?.block || '';
  const tag = element.tagName.toLowerCase();
  const semantic = safeToken(shortClassName(element));
  if (blockId) return `block:${safeToken(blockId)}:${tag}:${semantic}`;

  if (element.matches('.q-intro')) return 'quotation:intro';
  if (element.matches('.q-closing')) return 'quotation:closing';
  if (element.matches('.q-title h1')) return 'quotation:title';
  if (element.matches('.title-block h1')) return 'document:title';
  if (element.matches('.print-approval-declaration')) return 'approval:declaration';
  if (element.matches('.ltr-subject')) return 'letter:subject';
  if (element.matches('.ltr-to')) return 'letter:addressee';
  if (element.matches('.ltr-salut')) return 'letter:salutation';

  const term = element.closest('.q-term-flow');
  if (term) {
    const termIndex = [...root.querySelectorAll('.q-term-flow')].indexOf(term);
    const role = element.matches('h3') ? 'heading' : 'body';
    return `quotation:term:${Math.max(0, termIndex)}:${role}`;
  }

  if (element.matches('.letter-body')) {
    return `letter:body:${Math.max(0, indexAmong(root, '.letter-body', element))}`;
  }
  if (element.matches('.dc-body')) {
    return `document:body:${Math.max(0, indexAmong(root, '.dc-body', element))}`;
  }

  const sameKind = candidates.filter((candidate) => (
    candidate.tagName === element.tagName
    && safeToken(shortClassName(candidate)) === semantic
  ));
  const localIndex = sameKind.indexOf(element);
  return `auto:${tag}:${semantic}:${Math.max(0, localIndex)}`;
}

function assignStableKeys(root) {
  const candidates = governedCandidates(root);
  candidates.forEach((element) => {
    if (element.dataset.printTextKey) return;
    element.dataset.printTextKey = semanticKey(root, element, candidates);
    element.dataset.printTextAutoKey = 'true';
  });
  return candidates;
}

function applyAlignmentState(root, alignments, editing, selectedKey) {
  if (!root) return;
  root.dataset.printTextEditing = editing ? 'true' : 'false';
  const candidates = assignStableKeys(root);
  candidates.forEach((element) => {
    const key = element.dataset.printTextKey;
    const mode = normalizePrintTextAlignment(alignments?.[key]);
    if (mode) element.dataset.printTextAlign = mode;
    else delete element.dataset.printTextAlign;
    if (editing && selectedKey && key === selectedKey) element.dataset.printTextSelected = 'true';
    else delete element.dataset.printTextSelected;
  });
}

export default function PrintTextAlignmentEditor({ documentKey }) {
  const pathname = usePathname();
  const anchorRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [alignments, setAlignments] = useState({});
  const [recordSettings, setRecordSettings] = useState({});
  const [message, setMessage] = useState('');

  const storageKey = useMemo(
    () => printTextInstanceStorageKey(documentKey, pathname),
    [documentKey, pathname],
  );

  const root = useCallback(() => anchorRef.current?.parentElement || null, []);

  const refreshDom = useCallback(() => {
    applyAlignmentState(root(), alignments, editing, selectedKey);
  }, [alignments, editing, root, selectedKey]);

  useEffect(() => {
    let alive = true;
    setAlignments({});
    setRecordSettings({});
    setSelectedKey('');
    setSelectedLabel('');
    (async () => {
      const { data, error } = await supabase
        .from('print_layout_overrides')
        .select('settings')
        .eq('scope', 'document')
        .eq('scope_key', storageKey)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setMessage('تعذر قراءة تنسيق النص المحفوظ');
        return;
      }
      const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {};
      setRecordSettings(settings);
      setAlignments(settings.textAlignments && typeof settings.textAlignments === 'object' ? settings.textAlignments : {});
    })();
    return () => { alive = false; };
  }, [storageKey]);

  useEffect(() => {
    const host = root();
    if (!host) return undefined;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refreshDom);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(host, { childList:true, subtree:true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [refreshDom, root]);

  useEffect(() => {
    refreshDom();
  }, [refreshDom]);

  useEffect(() => {
    const host = root();
    if (!host || !editing) return undefined;
    const onClick = (event) => {
      if (event.target.closest('.print-command-dock,.no-print')) return;
      assignStableKeys(host);
      const target = event.target.closest('[data-print-text-key]');
      if (!target || !host.contains(target) || target.closest('.no-print')) return;
      event.preventDefault();
      event.stopPropagation();
      const key = target.dataset.printTextKey || '';
      setSelectedKey(key);
      setSelectedLabel(
        target.dataset.printTextLabel
        || String(target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 58)
        || 'النص المحدد',
      );
    };
    host.addEventListener('click', onClick, true);
    return () => host.removeEventListener('click', onClick, true);
  }, [editing, root]);

  const selectedAlignment = normalizePrintTextAlignment(alignments?.[selectedKey]);

  const persist = useCallback(async (nextAlignments, successMessage) => {
    const previousAlignments = alignments;
    const previousSettings = recordSettings;
    const nextSettings = {
      ...recordSettings,
      textAlignmentSchemaVersion:1,
      textGovernanceVersion:PRINT_TEXT_GOVERNANCE_VERSION,
      textAlignments:nextAlignments,
    };
    setAlignments(nextAlignments);
    setRecordSettings(nextSettings);
    setMessage('جارٍ الحفظ…');
    const { data:{ user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('print_layout_overrides').upsert({
      scope:'document',
      scope_key:storageKey,
      settings:nextSettings,
      updated_by_user_id:user?.id || null,
      updated_at:new Date().toISOString(),
    }, { onConflict:'scope,scope_key' });
    if (error) {
      setAlignments(previousAlignments);
      setRecordSettings(previousSettings);
      setMessage(`تعذر حفظ التنسيق: ${error.message}`);
      return;
    }
    setMessage(successMessage);
    window.setTimeout(() => setMessage(''), 1500);
  }, [alignments, recordSettings, storageKey]);

  const setAlignment = useCallback((mode) => {
    if (!selectedKey) return;
    const normalized = normalizePrintTextAlignment(mode);
    if (!normalized) return;
    persist({ ...alignments, [selectedKey]:normalized }, 'حُفظ تنسيق النص');
  }, [alignments, persist, selectedKey]);

  const clearAlignment = useCallback(() => {
    if (!selectedKey) return;
    const next = { ...alignments };
    delete next[selectedKey];
    persist(next, 'عاد النص لتنسيق القالب');
  }, [alignments, persist, selectedKey]);

  const controls = useMemo(() => (
    <>
      <button type="button" className={editing ? 'active' : ''} onClick={() => {
        setEditing((value) => !value);
        setSelectedKey('');
        setSelectedLabel('');
      }}>
        {editing ? 'إنهاء تنسيق النصوص' : 'تنسيق النصوص'}
      </button>
      {editing && <>
        <span className="print-text-selected-label">{selectedKey ? `المحدد: ${selectedLabel}` : 'اضغط على أي نص داخل الورقة ثم اختر المحاذاة'}</span>
        {PRINT_TEXT_ALIGNMENT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={!selectedKey}
            className={selectedAlignment === option.key ? 'active' : ''}
            onClick={() => setAlignment(option.key)}
          >{option.label}</button>
        ))}
        <button type="button" disabled={!selectedKey || !selectedAlignment} onClick={clearAlignment}>استخدام تنسيق القالب</button>
      </>}
      {message && <span className="print-text-message">{message}</span>}
    </>
  ), [clearAlignment, editing, message, selectedAlignment, selectedKey, selectedLabel, setAlignment]);

  usePrintCommandSection('text-format', controls, 20);

  return <>
    <span ref={anchorRef} className="no-print" data-print-text-editor-anchor="true" style={{display:'none'}} />
    <style jsx global>{`
      [data-print-text-align="right"]{text-align:right!important;text-align-last:auto!important}
      [data-print-text-align="center"]{text-align:center!important;text-align-last:auto!important}
      [data-print-text-align="left"]{text-align:left!important;text-align-last:auto!important}
      [data-print-text-align="justify"]{text-align:justify!important;text-align-last:justify!important;text-justify:inter-word!important}
      [data-print-text-editing="true"] [data-print-text-key]{cursor:text;outline:1px dashed rgba(139,51,50,.28);outline-offset:2px}
      [data-print-text-editing="true"] [data-print-text-key]:hover{outline:2px solid rgba(139,51,50,.58);background:rgba(139,51,50,.035)}
      [data-print-text-selected="true"]{outline:2px solid #8B3332!important;background:rgba(139,51,50,.07)!important}
      @media print{[data-print-text-editing="true"] [data-print-text-key],[data-print-text-selected="true"]{outline:none!important;background:transparent!important}}
    `}</style>
  </>;
}
