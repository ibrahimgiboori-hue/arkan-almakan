import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

/*
 * هندسة واحدة، قدرات متعددة.
 * الصفحة تمرر الاحتياج للمكوّنات المشتركة ولا تعيد اختراع primitive هندسي محلي.
 * إذا ظهر احتياج جديد نضيف القدرة للمكتبة الموحدة، لا CSS/Component خاص بالصفحة.
 */
const SHARED_SHAPE = /\bfunction\s+([A-Z]\w*(?:Table|Grid|ActionDock|ContextActions|Toolbar|RecordRow|RecordSummary)\w*)\s*\(/g;

function walk(relative, files = []) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return files;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child, files);
    else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

const pages = walk('app/dashboard');
for (const file of pages) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  let match;
  while ((match = SHARED_SHAPE.exec(text))) {
    failures.push(
      `${file}: يعرّف ${match[1]}() محلياً. أضف الاحتياج إلى primitive موحد في ConstitutionUI/WorkSheetKernel ثم استخدمه من الصفحة.`
    );
  }
}

if (failures.length) {
  console.error('Shared UI primitives boundary audit failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(`Shared UI primitives boundary audit passed: ${pages.length} ملف واجهة فُحص، لا primitives هندسية محلية موازية.`);
