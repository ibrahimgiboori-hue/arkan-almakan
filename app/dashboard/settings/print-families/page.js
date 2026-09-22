'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  PRINT_FAMILIES,
  PRINT_FAMILY_MIGRATION_ORDER,
} from '@/lib/print-family-catalog.mjs';
import { inspectPrintFamilyWorkbook } from '@/lib/print-family-workbook-client';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  InlineStatus,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(value) {
  return String(value || 'print-family.xlsx')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function stageLabel(stage) {
  if (stage === 'ready') return 'جاهزة';
  if (stage === 'building') return 'قيد التحويل';
  return 'في قائمة التحويل';
}

export default function PrintFamiliesSettingsPage() {
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [warnings, setWarnings] = useState([]);

  const families = useMemo(
    () => PRINT_FAMILY_MIGRATION_ORDER.map((id) => ({ id, ...PRINT_FAMILIES[id] })),
    []
  );

  async function load() {
    setErr('');
    const result = await supabase
      .from('print_family_workbooks')
      .select('family_id,storage_path,original_name,version,model_sheets,uploaded_at,updated_at')
      .order('family_id');

    if (result.error) {
      setRecords({});
      setErr(
        result.error.message.includes('print_family_workbooks')
          ? 'مخزن عائلات المطبوعات لم يُفعّل على قاعدة البيانات بعد. الواجهة جاهزة، ويبدأ العمل بعد تطبيق ترحيل العائلات.'
          : 'تعذّر قراءة ملفات العائلات: ' + result.error.message
      );
      return;
    }

    const map = {};
    for (const row of result.data || []) map[row.family_id] = row;
    setRecords(map);
  }

  useEffect(() => { load(); }, []);

  async function downloadCurrent(family) {
    const current = records?.[family.id];
    if (!current?.storage_path) return;

    setBusy('download:' + family.id);
    setErr('');
    setMsg('');
    setWarnings([]);

    const result = await supabase.storage.from('print-families').download(current.storage_path);
    setBusy('');

    if (result.error) {
      setErr('تعذّر تحميل ملف العائلة: ' + result.error.message);
      return;
    }

    downloadBlob(
      new Blob([result.data], { type:XLSX_MIME }),
      safeName(current.original_name || `${family.id}.xlsx`)
    );
  }

  async function uploadFamily(family, file) {
    if (!file) return;

    setBusy('upload:' + family.id);
    setErr('');
    setMsg('');
    setWarnings([]);

    const current = records?.[family.id] || null;
    const protectedModels = Array.isArray(current?.model_sheets) && current.model_sheets.length
      ? current.model_sheets
      : family.models;

    const inspection = await inspectPrintFamilyWorkbook(file, family, { protectedModels });
    if (inspection.errors.length) {
      setBusy('');
      setErr(inspection.errors.join(' '));
      setWarnings(inspection.warnings);
      return;
    }

    const nextVersion = Number(current?.version || 0) + 1;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${family.id}/v${nextVersion}-${timestamp}-${safeName(file.name)}`;

    const upload = await supabase.storage
      .from('print-families')
      .upload(storagePath, file, { upsert:false, contentType:XLSX_MIME, cacheControl:'0' });

    if (upload.error) {
      setBusy('');
      setErr('تعذّر رفع ملف العائلة: ' + upload.error.message);
      return;
    }

    const userResult = await supabase.auth.getUser();
    const metadata = await supabase
      .from('print_family_workbooks')
      .upsert({
        family_id:family.id,
        storage_path:storagePath,
        original_name:file.name,
        version:nextVersion,
        model_sheets:inspection.modelSheets,
        uploaded_by:userResult.data?.user?.id || null,
        uploaded_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }, { onConflict:'family_id' });

    if (metadata.error) {
      await supabase.storage.from('print-families').remove([storagePath]);
      setBusy('');
      setErr('تمت قراءة الملف لكن تعذّر اعتماده: ' + metadata.error.message);
      return;
    }

    setBusy('');
    setWarnings(inspection.warnings);
    setMsg(
      `تم اعتماد الإصدار ${nextVersion} من «${family.labelAr}» وقراءة ${inspection.modelSheets.length} نموذج من أسماء الـSheets.`
    );
    await load();
  }

  if (records === null) {
    return <ConstitutionPage><EmptyState title="جارٍ تحميل عائلات المطبوعات…" /></ConstitutionPage>;
  }

  return <ConstitutionPage>
    <PageHeader
      eyebrow="EXCEL PRINT FAMILIES"
      title="عائلات المطبوعات"
      description="حمّل ملف العائلة، عدّل التصميم داخل Excel، ثم ارفعه. البرنامج يعتمد المصنف نفسه ولا يعيد اختراع تصميم قريب منه."
    />

    {err ? <Notice tone="error">{err}</Notice> : null}
    {msg ? <InlineStatus tone="success" live>{msg}</InlineStatus> : null}
    {warnings.length ? <Notice tone="warning">{warnings.join(' ')}</Notice> : null}

    <Section
      title="قواعد الاعتماد"
      description="أي Sheet لا يبدأ اسمها بـ _ هو نموذج فعلي. إضافة Sheet تعني إضافة نموذج جديد. حذف نموذج موجود لا يتم بمجرد حذف الـSheet."
      boundary
    >
      <div style={{padding:16,display:'grid',gap:8,fontSize:13}}>
        <div>• <strong>Excel هو مصدر التصميم:</strong> الدمج، الخط، الحدود، الألوان، المحاذاة، المقاسات وإعدادات الصفحة تبقى ملك المصنف.</div>
        <div>• <strong>صفحات النظام:</strong> _VARIABLES و _DRESS_CODE و _BASE_A4_PORTRAIT_SAFE لا تظهر كنماذج.</div>
        <div>• <strong>الحماية من الحذف:</strong> الملف المرفوع يجب أن يحتفظ بكل النماذج الموجودة في الإصدار السابق، بينما يمكنه إضافة نماذج جديدة بحرية.</div>
      </div>
    </Section>

    <div style={{display:'grid',gap:14}}>
      {families.map((family) => {
        const current = records[family.id];
        const uploading = busy === 'upload:' + family.id;
        const downloading = busy === 'download:' + family.id;
        const models = Array.isArray(current?.model_sheets) && current.model_sheets.length
          ? current.model_sheets
          : family.models;

        return <Section
          key={family.id}
          title={family.labelAr}
          description={`${stageLabel(family.migrationStage)} · ${models.length} نموذج معروف`}
          boundary
        >
          <div style={{padding:16,display:'grid',gap:12}}>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <span className="pill">الإصدار {current?.version || '—'}</span>
              {models.map((name) => <span key={name} className="pill">{name}</span>)}
            </div>

            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <button
                type="button"
                className="btn ghost"
                disabled={!current?.storage_path || downloading || uploading}
                onClick={() => downloadCurrent(family)}
              >
                {downloading ? 'جارٍ التحميل…' : 'تحميل ملف العائلة الحالي'}
              </button>

              <label className="btn ghost" style={{cursor:uploading?'wait':'pointer'}}>
                {uploading ? 'جارٍ فحص ورفع الملف…' : current ? 'رفع نسخة معدلة' : 'رفع ملف العائلة الأول'}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={uploading || downloading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    uploadFamily(family, file);
                  }}
                  style={{display:'none'}}
                />
              </label>
            </div>

            <div className="hint">
              {current
                ? `آخر ملف: ${current.original_name || 'بدون اسم'} · الإصدار ${current.version}. النسخ السابقة تبقى محفوظة في التخزين.`
                : 'لم يُعتمد ملف لهذه العائلة بعد. أول ملف مرفوع يجب أن يحتوي النماذج الأساسية المذكورة أعلاه، وبعده يمكن إضافة Sheets جديدة.'}
            </div>
          </div>
        </Section>;
      })}
    </div>
  </ConstitutionPage>;
}
