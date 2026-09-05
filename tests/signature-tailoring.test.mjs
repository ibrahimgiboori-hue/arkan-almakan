import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('ARKAN SIGNATURE tailoring remains part of the single root-controlled skin pack', () => {
  const layout = read('app/layout.js');
  const manifest = read('lib/ui-skin-manifest.js');
  const baseAt = layout.indexOf("import './ui-signature-skin.css'");
  const tailoringAt = layout.indexOf("import './ui-signature-tailoring.css'");

  assert.ok(baseAt >= 0, 'base Signature skin must stay loaded');
  assert.ok(tailoringAt > baseAt, 'system tailoring must load after the base Signature skin');
  assert.match(manifest, /signatureTailoring:'app\/ui-signature-tailoring\.css'/);
});

test('dashboard hall does not reserve an empty desktop context panel', () => {
  const nav = read('components/ui/ContextualDashboardNavigation.js');
  assert.match(nav, /const hasDesktopContext = Boolean\(projectId \|\| currentArea\)/);
  assert.match(nav, /data-open=\{hasDesktopContext && desktopExpanded \? 'true' : 'false'\}/);
  assert.match(nav, /\{hasDesktopContext \? \(/);
});

test('loading states are semantic and visually distinguishable from true empty states', () => {
  const bridge = read('components/ui/LegacySemanticBridgeRuntime.js');
  const ui = read('components/ui/ConstitutionUI.js');
  const tailoring = read('app/ui-signature-tailoring.css');

  assert.match(bridge, /data-ui-state', 'loading'/);
  assert.match(bridge, /aria-busy', 'true'/);
  assert.match(ui, /data-ui-state=\{loading \? 'loading' : undefined\}/);
  assert.match(tailoring, /\[data-ui-slot='empty'\]\[data-ui-state='loading'\]/);
});

test('surviving legacy markup is adapted into the shared visual language', () => {
  const bridge = read('components/ui/LegacySemanticBridgeRuntime.js');
  assert.match(bridge, /\.field:not\(\[data-ui-role\]\)/);
  assert.match(bridge, /'data-ui-role':'field-group'/);
  assert.match(bridge, /table:not\(\[data-ui-role\]\)/);
  assert.match(bridge, /'data-ui-role':'table'/);
});

test('company settings no longer exposes obsolete competing screen themes', () => {
  const settings = read('app/dashboard/settings/page.js');
  assert.doesNotMatch(settings, /UI_THEME_PRESETS|saveTheme\(|ui_theme_preset/);
  assert.match(settings, /ARKAN SIGNATURE/);
  assert.match(settings, /التوكسيدو المعتمد/);
  assert.match(settings, /ألوان الهوية في المستندات/);
});
