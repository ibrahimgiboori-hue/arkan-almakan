// الطبقات المعمارية الثابتة لأركان المكان.
// الهدف: منطق البرنامج يبقى قابلًا للحياة حتى لو تبدلت «بدلة التوكسيدو» بالكامل.

export const ARCHITECTURE_LAYERS = Object.freeze({
  core:Object.freeze({
    id:'core',
    purpose:'business-rules-and-pure-decision-models',
    mayDependOn:Object.freeze(['core']),
    mayKnow:Object.freeze(['plain-data','domain-terms']),
    mustNotKnow:Object.freeze(['react','next','css','dom','supabase','screen-skin','print-skin']),
  }),
  adapters:Object.freeze({
    id:'adapters',
    purpose:'translate-storage-network-and-platform-data-into-core-inputs',
    mayDependOn:Object.freeze(['core','adapters']),
    mustNotOwn:Object.freeze(['business-decisions','visual-identity']),
  }),
  application:Object.freeze({
    id:'application',
    purpose:'orchestrate-use-cases-and-runtime-context',
    mayDependOn:Object.freeze(['core','adapters','application']),
    mustNotOwn:Object.freeze(['visual-identity']),
  }),
  presentation:Object.freeze({
    id:'presentation',
    purpose:'semantic-screen-structure-and-user-interaction',
    mayDependOn:Object.freeze(['core','application','presentation']),
    mustNotOwn:Object.freeze(['business-rules','brand-palette']),
  }),
  skin:Object.freeze({
    id:'skin',
    purpose:'replaceable-screen-identity-only',
    mayDependOn:Object.freeze(['presentation','skin']),
    mustNotOwn:Object.freeze(['business-rules','permissions','data-writes','print-pagination']),
  }),
  print:Object.freeze({
    id:'print',
    purpose:'document-and-pagination-constitution',
    mayDependOn:Object.freeze(['core','application','print']),
    mustNotDependOn:Object.freeze(['screen-skin']),
  }),
});

export const ARCHITECTURE_PRINCIPLES = Object.freeze([
  'core-survives-a-complete-screen-redesign',
  'screen-skin-is-replaceable-without-changing-business-behavior',
  'adapters-translate-infrastructure-without-owning-policy',
  'legacy-patches-may-be-absorbed-but-may-not-grow',
  'print-remains-independent-from-screen-skin',
]);

export function architectureLayer(name) {
  return ARCHITECTURE_LAYERS[name] || null;
}
