import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

const file = 'app/dashboard/operating-budget/page.js';
let text = fs.readFileSync(file, 'utf8');

const badCorrection = [
  '        const isCorrection = window.confirm(',
  "          'هل هذا تصحيح لبيانات سابقة?",
  '',
  "اختيار «موافق» يعيد حساب التقديرات فقط وفق المعلومة المصححة، ولا يغيّر القيمة الفعلية أو المدفوع.'",
  '        );',
].join('\n');
const goodCorrection = [
  '        const isCorrection = window.confirm(',
  "          'هل هذا تصحيح لبيانات سابقة؟\\n\\nاختيار «موافق» يعيد حساب التقديرات فقط وفق المعلومة المصححة، ولا يغيّر القيمة الفعلية أو المدفوع.'",
  '        );',
].join('\n');
text = replaceOnce(text, badCorrection, goodCorrection, 'correction confirmation syntax');

const badCurrent = [
  '          const applyFromCurrentCycle = window.confirm(',
  "            'هل تريد تطبيق التغيير من دورة ' + monthLabelAr(month) + ' وما بعدها?",
  '',
  "اختيار «إلغاء» هنا يعني عدم الحفظ.'",
  '          );',
].join('\n');
const goodCurrent = [
  '          const applyFromCurrentCycle = window.confirm(',
  "            'هل تريد تطبيق التغيير من دورة ' + monthLabelAr(month) + ' وما بعدها؟\\n\\nاختيار «إلغاء» هنا يعني عدم الحفظ.'",
  '          );',
].join('\n');
text = replaceOnce(text, badCurrent, goodCurrent, 'current-cycle confirmation syntax');

text = replaceOnce(
  text,
  "      p_reason: scope === 'this_month' ? 'تعديل هذا الشهر فقط' : 'تحديث أساس الاحتساب من هذا الشهر وما بعده',",
  "      p_reason: scope === 'this_month' ? 'تصحيح تقدير هذا الشهر' : 'تغيير مدخلات التقدير من الدورة الحالية وما بعدها',",
  'line estimate reason wording',
);
text = replaceOnce(
  text,
  "    }), scope === 'this_month' ? 'تم تعديل هذا الشهر فقط.' : 'تم تحديث أساس الاحتساب الجاري.', setWorkErr);",
  "    }), scope === 'this_month' ? 'تم تصحيح تقدير هذا الشهر.' : 'تم تسجيل التغيير من الدورة الحالية.', setWorkErr);",
  'line estimate success wording',
);

fs.writeFileSync(file, text);
console.log('PR #8 dialog syntax fix completed.');
