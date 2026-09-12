'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { byCode } from '@/lib/doc-templates';
import { EN_TITLES } from '@/lib/doc-titles';
import ConstitutionPrintFrame from '@/components/print/ConstitutionPrintFrame';
import {
  buildCleanDocumentBlocks,
  CleanPrintToolbar,
  resolveCleanSections,
} from '@/components/print/forms-v2/CleanDocumentFlow';

const PROJECT_REPORT_PROFILE = 'project_work_claims_report';
const HANDOVER_CODE = 'CAT_PROCUREMENT_ASSETS_ASSET_HANDOVER';
const clampRows = (value, min = 1, max = 20) => Math.max(min, Math.min(max, Number(value) || min));

export default function PrintDoc() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [stamp, setStamp] = useState(true);
  const [bank, setBank] = useState(false);
  const [blankForm, setBlankForm] = useState(false);
  const [blankRows, setBlankRows] = useState(6);
  const [blankStatusRows, setBlankStatusRows] = useState(4);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [documentResult, settingsResult] = await Promise.all([
        supabase.from('documents').select('*').eq('id', id).maybeSingle(),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      if (cancelled) return;
      if (documentResult.error || !documentResult.data) {
        setErr('لم يُعثر على هذا المستند، أو لا تملك صلاحية عرضه.');
        return;
      }

      const loadedDoc = documentResult.data;
      setDoc(loadedDoc);
      setCfg(settingsResult.data || {});
      setStamp(loadedDoc.show_stamp ?? settingsResult.data?.show_stamp_by_default ?? true);

      const { data: template } = await supabase
        .from('document_templates')
        .select('*')
        .eq('code', loadedDoc.template_code)
        .maybeSingle();
      if (cancelled) return;
      setTpl(template || null);
      setBank(loadedDoc.show_bank ?? template?.show_bank ?? false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const legacy = useMemo(() => doc ? byCode(doc.template_code) : null, [doc]);
  const payload = doc?.payload || {};
  const sections = useMemo(
    () => doc ? resolveCleanSections({ templateCode:doc.template_code, tpl, legacy }) : [],
    [doc, tpl, legacy],
  );
  const hasRepeatableSection = sections.some((section) => section?.kind === 'table');
  const isProjectReport = tpl?.layout?.profile === PROJECT_REPORT_PROFILE;

  const rows = useMemo(() => {
    const sourceRows = Array.isArray(payload?._rows) ? payload._rows : [];
    if (!blankForm || !hasRepeatableSection) return sourceRows;
    return Array.from({ length:clampRows(blankRows) }, (_, index) => ({
      _id:`blank-${index + 1}`,
      _blank:true,
    }));
  }, [payload, blankForm, hasRepeatableSection, blankRows]);

  if (err) return <div style={{padding:40}}>{err}</div>;
  if (!doc || !cfg) return <div style={{padding:40}}>جارٍ التحميل…</div>;

  const title = blankForm
    ? (tpl?.name_ar || legacy?.name || doc.template_code)
    : (payload.letter_title || tpl?.name_ar || legacy?.name || doc.template_code);
  const titleEn = tpl?.title_en
    || EN_TITLES[doc.template_code]
    || (doc.template_code === HANDOVER_CODE ? 'EQUIPMENT / TOOL HANDOVER FORM' : '');

  const flow = buildCleanDocumentBlocks({
    doc,
    tpl,
    legacy,
    title,
    titleEn,
    payload,
    rows,
    blankForm,
    blankStatusRows,
    cfg,
    stamp,
    bank,
  });

  return (
    <>
      <CleanPrintToolbar
        stamp={stamp}
        setStamp={setStamp}
        bank={bank}
        setBank={setBank}
        blankForm={blankForm}
        setBlankForm={setBlankForm}
        hasRepeatableSection={hasRepeatableSection}
        blankRows={blankRows}
        setBlankRows={(value) => setBlankRows(clampRows(value))}
        isProjectReport={isProjectReport}
        blankStatusRows={blankStatusRows}
        setBlankStatusRows={(value) => setBlankStatusRows(clampRows(value,1,8))}
      />

      <ConstitutionPrintFrame
        documentKey="generic_document"
        cfg={cfg}
        className={blankForm ? 'clean-blank-form' : ''}
      >
        {flow}
      </ConstitutionPrintFrame>
    </>
  );
}
