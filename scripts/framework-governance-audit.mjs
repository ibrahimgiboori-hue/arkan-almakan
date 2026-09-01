import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = (message) => { throw new Error(`[framework-governance] ${message}`); };
const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(value, minimum) {
  const a = parseVersion(value);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

const nextVersion = pkg.dependencies?.next;
const reactVersion = pkg.dependencies?.react;
const reactDomVersion = pkg.dependencies?.['react-dom'];

if (!atLeast(nextVersion, '16.3.3') || parseVersion(nextVersion)?.[0] !== 16) {
  fail(`Next.js must stay on the approved secure 16.x line at or above 16.3.3; found ${nextVersion || 'missing'}`);
}
if (!atLeast(reactVersion, '19.2.8') || parseVersion(reactVersion)?.[0] !== 19) {
  fail(`React must stay on the approved 19.x line at or above 19.2.8; found ${reactVersion || 'missing'}`);
}
if (reactDomVersion !== reactVersion) {
  fail(`react-dom must exactly match react; found react=${reactVersion}, react-dom=${reactDomVersion}`);
}
if (pkg.engines?.node !== '24.x') {
  fail(`project runtime must remain aligned on Node 24.x; found ${pkg.engines?.node || 'missing'}`);
}

const proxyPath = path.join(root, 'proxy.js');
const middlewarePath = path.join(root, 'middleware.js');
if (!fs.existsSync(proxyPath)) fail('Next 16 proxy.js entrypoint is required');
if (fs.existsSync(middlewarePath)) fail('deprecated middleware.js must not return after proxy migration');
const proxySource = fs.readFileSync(proxyPath, 'utf8');
if (!proxySource.includes('export function proxy')) fail('proxy.js must export function proxy');
if (!proxySource.includes("matcher: ['/jobs/:path*']")) fail('legacy /jobs compatibility redirect must remain governed by proxy');

const nextConfigPath = path.join(root, 'next.config.mjs');
const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
for (const retired of ['experimental.ppr', 'experimental.dynamicIO', 'experimental.turbopack']) {
  if (nextConfig.includes(retired)) fail(`retired Next configuration must not return: ${retired}`);
}

console.log(`Framework governance audit passed: Next ${nextVersion}, React ${reactVersion}, Node ${pkg.engines.node}, proxy entrypoint active.`);
