import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const requireFile = (rel) => {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) {
    failures.push(`${rel}: الملف مفقود.`);
    return '';
  }
  return read(rel);
};

const anatomy = requireFile('lib/anatomical-navigation.js');
for (const required of [
  'place-first-navigation-v2',
  'implicit-consciousness-not-navigation-root',
  'real-portal-hall-not-menu-root',
  'return-to-portal-hall-when-leaving-current-place',
  'portalHallMustBeBodySurface',
  'portalHallMustNotRequireNavigationMenu',
  'interior-portal-hall-v1',
  "primaryZone:'live-operational-work'",
  "secondaryZone:'registry-and-history'",
  "registryDefault:'quiet-collapsed-until-requested'",
  "toolsOwner:'contextual-navigation-not-body-duplicate'",
  'reusableAcrossPortals:true',
  "pilotPortal:'projects'",
  "'/dashboard/projects': 'سجل المشاريع'",
  "'/dashboard/employees': 'سجل الموظفين'",
  'anatomyAreaLabel',
  'anatomyToolLabel',
  'anatomyGroupLabel',
]) {
  if (!anatomy.includes(required)) failures.push(`التشريح: مفقود ${required}`);
}

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  "from '@/lib/anatomical-navigation'",
  'anatomyAreaLabel',
  'anatomyToolLabel',
  'anatomyGroupLabel',
  'appNavRail',
  'appContextNav',
  'data-navigation-layer="primary-rail"',
  'data-project-navigation="all-groups-visible"',
  'كل البوابات',
]) {
  if (!nav.includes(required)) failures.push(`الملاحة التشريحية: مفقود ${required}`);
}

if (/>\s*أركان المكان\s*</.test(nav)) {
  failures.push('الوعي المستتر: اسم أركان المكان عاد كعنصر مرئي داخل الملاحة اليومية.');
}
if (nav.includes('router.back(')) {
  failures.push('الرجوع التشريحي: لا يجوز استخدام تاريخ المتصفح كأب تشريحي.');
}
if (/single-open-accordion|type:'areaGroup'|type:'projectGroup'|expandedProjectGroupKey/.test(nav)) {
  failures.push('التشريح: عادت مستويات تفاعلية زائدة؛ القائمة الجديدة يجب أن تعرض سياق المكان مباشرة بلا حفر في قوائم داخل قوائم.');
}
if (/onPointerEnter|openFromIntent|appNavHotZone/.test(nav)) {
  failures.push('التشريح: عادت ملاحة مخفية أو تعمل بالمرور؛ الملاحة الأساسية يجب أن تكون ظاهرة ومقصودة.');
}

const hall = requireFile('app/dashboard/page.js');
for (const required of [
  'data-portal-hall="true"',
  'بوابات العمل',
  'filterAreasForAccess(AREAS',
  "area.key !== 'home'",
  'أعمالي',
  'بانتظار قراري',
]) {
  if (!hall.includes(required)) failures.push(`صالة البوابات: مفقود ${required}`);
}

if (hall.includes('مركز العمل')) {
  failures.push('صالة البوابات: عاد مفهوم «مركز العمل» القديم بدل المكان الأعلى الفعلي.');
}
if (!hall.includes('href={portal.href}')) {
  failures.push('صالة البوابات: يجب أن تدخل البوابة من مسارها الدستوري بدل خريطة روابط موازية.');
}

const interiorHall = requireFile('components/ui/PortalHall.js');
for (const required of [
  'data-interior-portal-hall="true"',
  'data-portal-body-role="work-first"',
  'data-portal-zone="live-operational-work"',
  'data-portal-zone="registry-and-history"',
  'PortalLiveZone',
  'PortalRegistry',
]) {
  if (!interiorHall.includes(required)) failures.push(`صالة البوابة الداخلية: مفقود ${required}`);
}

const projectsHall = requireFile('app/dashboard/projects/page.js');
for (const required of [
  "from '@/components/ui/PortalHall'",
  '<PortalHall portalKey="projects">',
  '<PortalLiveZone',
  '<PortalRegistry',
  'قيد التنفيذ الآن',
  'بقية المشاريع',
  "row.stage==='execution'",
]) {
  if (!projectsHall.includes(required)) failures.push(`بوابة المشاريع التجريبية: مفقود ${required}`);
}
if (projectsHall.includes('<SummaryStrip')) {
  failures.push('بوابة المشاريع: لا تعُد إلى شريط مؤشرات عام قبل العمل الحي؛ المدخل أصبح work-first.');
}

if (failures.length) {
  console.error('\nAnatomical navigation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Anatomical navigation audit passed: portal hall remains the real top place, desktop navigation is a visible portal rail plus one contextual list, mobile reuses the same map in a drawer, and no nested navigation maze or browser-history back logic is allowed.');
