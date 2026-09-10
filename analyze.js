/**
 * Summarise a sanitized n8n workflow: triggers, node mix, credentials and
 * external endpoints. Used to draft the per-workflow documentation.
 *
 * Usage: node analyze.js workflows/<slug>/workflow.json
 */
const fs = require('fs');

const target = process.argv[2];
if (!target) {
  console.error('usage: node analyze.js <path-to-workflow.json>');
  process.exit(1);
}

const wf = JSON.parse(fs.readFileSync(target, 'utf8'));
const nodes = wf.nodes || [];
const shortType = (t) => String(t).replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-langchain\./, 'lc.');

console.log(`name: ${wf.name || '(unnamed)'}`);
console.log(`nodes: ${nodes.length}   active: ${wf.active}`);

const triggers = nodes.filter(
  (n) => /trigger|webhook|formTrigger|executeWorkflowTrigger/i.test(n.type) || n.type.endsWith('.manualTrigger'),
);
console.log(`\n-- triggers (${triggers.length}) --`);
for (const t of triggers) {
  const p = t.parameters || {};
  const detail = [p.path && `path=${p.path}`, p.rule && `rule=${JSON.stringify(p.rule)}`, p.formTitle && `form="${p.formTitle}"`, p.httpMethod]
    .filter(Boolean)
    .join('  ');
  console.log(`  ${t.name}  [${shortType(t.type)}]  ${detail}`);
}

const counts = {};
for (const n of nodes) counts[shortType(n.type)] = (counts[shortType(n.type)] || 0) + 1;
console.log(`\n-- node types --`);
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([t, c]) => console.log(`  ${String(c).padStart(3)}  ${t}`));

const creds = new Set();
for (const n of nodes) for (const c of Object.keys(n.credentials || {})) creds.add(c);
console.log(`\n-- credential types (${creds.size}) --`);
[...creds].sort().forEach((c) => console.log(`  ${c}`));

const urls = new Set();
for (const n of nodes) {
  const u = n.parameters && n.parameters.url;
  if (typeof u === 'string' && u) urls.add(u.length > 100 ? `${u.slice(0, 100)}...` : u);
}
if (urls.size) {
  console.log(`\n-- outbound urls (${urls.size}) --`);
  [...urls].sort().forEach((u) => console.log(`  ${u}`));
}

const errorHandling = nodes.filter((n) => n.onError || n.retryOnFail || n.continueOnFail);
console.log(`\n-- nodes with explicit error handling (${errorHandling.length}/${nodes.length}) --`);
errorHandling.forEach((n) =>
  console.log(`  ${n.name}: onError=${n.onError || '-'} retryOnFail=${n.retryOnFail || false} maxTries=${n.maxTries || '-'}`),
);

console.log(`\n-- flow --`);
for (const [from, out] of Object.entries(wf.connections || {})) {
  const targets = (out.main || [])
    .map((branch, i) => (branch || []).map((c) => `${(out.main || []).length > 1 ? `[${i}]` : ''}${c.node}`).join(', '))
    .filter(Boolean)
    .join('  |  ');
  if (targets) console.log(`  ${from}  ->  ${targets}`);
}
