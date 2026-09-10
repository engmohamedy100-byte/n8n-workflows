/**
 * Walk n8n workflow JSON exports and report values that look like live secrets.
 * Read-only: prints findings grouped by file, never modifies input.
 */
const fs = require('fs');
const path = require('path');

// Keys whose values are worth inspecting regardless of the value's shape.
const SUSPECT_KEY = /key|token|secret|auth|password|passwd|bearer|apikey/i;

// Value shapes that look like credentials rather than harmless identifiers.
const SECRET_SHAPES = [
  ['openai-style', /^sk-[A-Za-z0-9_-]{16,}$/],
  ['github-pat', /^gh[pousr]_[A-Za-z0-9]{20,}$/],
  ['google-api-key', /^AIza[A-Za-z0-9_-]{30,}$/],
  ['slack-token', /^xox[baprs]-[A-Za-z0-9-]{10,}$/],
  ['telegram-bot-token', /^\d{8,10}:AA[A-Za-z0-9_-]{30,}$/],
  ['hex-40', /^[a-f0-9]{40}$/],
  ['hex-32', /^[a-f0-9]{32}$/],
  ['bearer-header', /^Bearer\s+[A-Za-z0-9._-]{20,}$/i],
  ['jwt', /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./],
  // Some APIs (Green API, Twilio-style callbacks) put the token in the URL path
  // or query string rather than a header, where a key-name check never sees it.
  ['credential-in-url', /^=?https?:\/\/[^\s"]*(?:waInstance\d+|[?&](?:token|key|api_?key|access_token|secret)=)[^\s"]*/i],
  ['long-hex-in-url', /^=?https?:\/\/[^\s"]*\/[a-f0-9]{32,}(?:[/?#]|$)/i],
];

// n8n node ids and similar are UUIDs - never secrets.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Standard n8n option values that sit under credential-ish parameter names.
const N8N_ENUM_VALUES = new Set([
  'genericCredentialType',
  'predefinedCredentialType',
  'headerAuth',
  'basicAuth',
  'queryAuth',
  'digestAuth',
  'oAuth1Api',
  'oAuth2Api',
  'none',
]);

// Structural n8n metadata, not user data.
const SKIP_KEYS = new Set(['id', 'versionId', 'instanceId', 'webhookId', 'typeVersion', 'nodeId']);

function classify(value) {
  if (UUID.test(value)) return null;
  for (const [label, pattern] of SECRET_SHAPES) {
    if (pattern.test(value)) return label;
  }
  return null;
}

function walk(node, nodePath, out) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${nodePath}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  // n8n stores headers/query params as {"name": ..., "value": ...} pairs.
  const { name, value } = node;
  if (
    typeof name === 'string' &&
    typeof value === 'string' &&
    value &&
    SUSPECT_KEY.test(name) &&
    !isNotCredentialShaped(value)
  ) {
    out.push([`${nodePath}.${name}`, value, 'suspicious-param-name']);
  }

  for (const [key, child] of Object.entries(node)) {
    const childPath = nodePath ? `${nodePath}.${key}` : key;
    if (typeof child === 'string' && !SKIP_KEYS.has(key)) {
      const shape = classify(child);
      if (shape) {
        out.push([childPath, child, shape]);
      } else if (
        SUSPECT_KEY.test(key) &&
        child.length >= 16 &&
        !isNotCredentialShaped(child)
      ) {
        out.push([childPath, child, 'suspicious-key-name']);
      }
    } else {
      walk(child, childPath, out);
    }
  }
}

function redact(value) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)} (len ${value.length})`;
}

// The suspicious-key-name rule fires on the parameter *name* alone, so it also
// catches n8n's own `sessionKey`/`outputKey` and Notion field names ending in
// "key". A real credential is one contiguous high-entropy token, so anything
// with whitespace, a field separator, a placeholder, or an n8n expression is
// not one. Applied only to that rule -- shape matches always report.
function isNotCredentialShaped(value) {
  return (
    N8N_ENUM_VALUES.has(value) ||
    /\s/.test(value) ||
    value.includes('|') ||
    /^<[A-Z0-9_]+>$/.test(value) ||
    /^=/.test(value) ||
    value.includes('{{')
  );
}

const files = fs.readdirSync('.').filter((f) => f.endsWith('.json')).sort();
let total = 0;

for (const file of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.log(`!! ${file}: could not parse -- ${err.message}`);
    continue;
  }

  const findings = [];
  walk(data, '', findings);

  // De-duplicate identical (value, shape) pairs, keeping the first path seen.
  const seen = new Set();
  const unique = findings.filter(([, value, shape]) => {
    const SEP = String.fromCharCode(0);
    const fingerprint = `${value}${SEP}${shape}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });

  if (unique.length) {
    console.log(`\n=== ${file} ===`);
    for (const [p, value, shape] of unique) {
      console.log(`  [${shape}] ${redact(value)}`);
      console.log(`      at ${p}`);
    }
    total += unique.length;
  }
}

console.log(`\n---\n${total} finding(s) across ${files.length} file(s).`);
