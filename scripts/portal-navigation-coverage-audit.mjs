import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');

const constitution=read('lib/app-constitution.js');
const shell=read('lib/navigation-shell-constitution.js');
const sections=read('lib/portal-section-constitution.js');
const living=read('lib/living-navigation.js');
const model=read('lib/portal-living-navigation.js');
const nav=read('components/ui/ContextualDashboardNavigation.js');

const portals=['projects','workforce','finance','documents','admin'];

function areaBlock(portalKey){
  const start=constitution.indexOf(`key: '${portalKey}'`);
  if(start<0)return '';
  const nextCandidates=portals
    .map((key)=>constitution.indexOf(`key: '${key}'`,start+1))
    .filter((index)=>index>start);
  const end=nextCandidates.length?Math.min(...nextCandidates):constitution.indexOf(']);',start);
  return constitution.slice(start,end>start?end:undefined);
}

function visibleLiteralHrefs(portalKey){
  const block=areaBlock(portalKey);
  const hrefs=[];
  for(const line of block.split('\n')){
    if(/hidden:\s*true|legacy:\s*true/.test(line))continue;
    const href=line.match(/href:\s*'([^']+)'/)?.[1];
    if(href&&!/\/(?:new|create)\/?$/.test(href))hrefs.push(href);
  }
  return [...new Set(hrefs)];
}

function sectionKeys(portalKey){
  const matches=[...sections.matchAll(/section\('([^']+)',\s*'([^']+)'/g)];
  return matches.filter((match)=>match[1]===portalKey).map((match)=>match[2]);
}

function coveredByShellLiteral(href){
  return shell.includes(`'${href}'`)||shell.includes(`\"${href}\"`);
}

function coveredByShellSection(portalKey,sectionKey){
  return shell.includes(`portalSectionHref('${portalKey}','${sectionKey}')`)
    ||shell.includes(`portalSectionHref('${portalKey}', '${sectionKey}')`);
}

for(const portalKey of portals){
  if(!shell.includes(`${portalKey}: Object.freeze([`)){
    failures.push(`${portalKey}: لا توجد له خريطة عقد داخل SHELL_PORTAL_GROUPS.`);
  }

  for(const href of visibleLiteralHrefs(portalKey)){
    const projectGuardian=portalKey==='projects'&&(
      (href==='/dashboard/projects'&&living.includes("key:'active'"))
      ||(href==='/dashboard/quotes'&&living.includes("key:'quotes'"))
    );
    if(!projectGuardian&&!coveredByShellLiteral(href)){
      failures.push(`${portalKey}: الأداة ${href} ظاهرة في الدستور ولا تملك عقدة في الملاحة الحية.`);
    }
  }

  for(const sectionKey of sectionKeys(portalKey)){
    if(!coveredByShellSection(portalKey,sectionKey)){
      failures.push(`${portalKey}: القسم ${sectionKey} موجود في كتالوج البوابة ولا تملكه أي عقدة ملاحة.`);
    }
  }
}

for(const required of [
  "LIVING_PORTALS = Object.freeze(['projects','workforce','finance','documents','admin'])",
  'portalEntryNodes',
  'livingPortalGroups',
  'portalCoverageReport',
  'generatedCoverageFallback:true',
  "if (portalKey !== 'projects')",
]){
  if(!model.includes(required))failures.push(`محرك الملاحة العام: مفقود ${required}`);
}

for(const required of [
  'portalEntryNodes',
  'entryNodesByArea',
  'entryNodes.map',
  'data-branch-kind="portal-entry-nodes"',
  'data-living-branch-scope="all-portals"',
]){
  if(!nav.includes(required))failures.push(`القائمة الموحدة: مفقود ${required}`);
}

if(/area\.key\s*===\s*['\"]projects['\"][\s\S]{0,260}?<div className=\"appNavChildren\"/.test(nav)){
  failures.push('القائمة الموحدة: ما زال رسم الفروع يملك مسار JSX خاصًا بالمشاريع بدل محرك عقد واحد.');
}

if(!living.includes('sameBehaviorEngineAcrossAllPortals:true')){
  failures.push('DNA الملاحة: قاعدة تعميم السلوك على كل البوابات مفقودة.');
}

if(failures.length){
  console.error('\nPortal navigation coverage audit failed:\n');
  failures.forEach((failure)=>console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Portal navigation coverage audit passed: every current visible portal tool/section has a living-navigation path, and all five portals render their entry branches through one behavior engine.');
