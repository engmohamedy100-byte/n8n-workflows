# AI-Powered Customer Service & Sales Automation System

An Arabic-language WhatsApp customer service and sales agent with RAG-backed
knowledge retrieval, Airtable as the CRM, and an Airtable-based rate limiter.

- Source file: `AI-Powered Customer Service & Sales Automation System.json`
- Internal name: `ismail_workflow`
- 101 nodes, 5 triggers, exported `active: true`

This is the only workflow in the collection exported in an active state, so the
security notes at the bottom are not hypothetical for it.

## What it does

Inbound WhatsApp messages hit a webhook, are acknowledged immediately, then
routed through classification, a rate-limit check, and an AI agent that answers
using a Supabase vector store built from documents in Google Drive.
Conversations and leads are tracked in Airtable, with Telegram used for
internal notification and a cron-driven follow-up cycle.

Node names and the Airtable base (`رخاء عمان`) are in Arabic — this serves an
Arabic-speaking market.

## Triggers

| Trigger | Type | Configuration |
|---|---|---|
| Get Message | `webhook` | Path `whatsapp`, `multipleMethods: true`, `responseMode: responseNode`. |
| Google Drive Trigger | `googleDriveTrigger` | Watches for new/changed knowledge-base documents. |
| On form submission | `formTrigger` | Form "Add info". |
| Schedule Trigger | `scheduleTrigger` | Cron `0 0 14,18,22 * * 0-4,6` — 14:00, 18:00 and 22:00, Saturday–Thursday (skips Friday). |
| Respond to Webhook | `respondToWebhook` | Returns `{"status": "received"}` immediately. |

## Architecture

```
WhatsApp ──> Get Message (webhook /whatsapp)
                ├─[0]─> Respond to Webhook        ({"status":"received"} — instant ack)
                ├─[1]─> get(phone and code and message)
                │         └─> ... classification / routing ...
                │               └─> Merge ─> RateLimiter (Airtable search)
                │                              └─> AI Agent (OpenAI + Simple Memory)
                │                                    └─> Supabase Vector Store (retrieval)
                │                                          └─> Green API send ─> WhatsApp reply
                └─[2]─> Add Failed Messages1     (error path)

Google Drive Trigger ──> Extract from File ──> Text Splitter ──> Gemini Embeddings
                                                                    └─> Supabase Vector Store (ingest)

Schedule Trigger ──> follow-up cycle ──> Airtable + Telegram
```

## Key node groups

| Group | Count | Purpose |
|---|---|---|
| `airtable` | 21 | CRM: contacts, conversations, failed messages, rate-limit ledger. |
| `set` / `code` | 24 | Payload shaping and Arabic text handling. |
| `if` | 9 | Routing and guards. |
| `stickyNote` | 14 | In-canvas documentation. |
| `vectorStoreSupabase` | 2 | One ingest, one retrieval. |
| `embeddingsGoogleGemini` | 2 | Embedding for both sides. |
| `wait` | 4 | Follow-up delays. |
| `telegram` | 2 | Internal notifications. |

The webhook acknowledges instantly and continues processing on a separate
branch — the right pattern, since WhatsApp providers retry on slow responses.
From there data flows: raw payload → extracted phone/code/message →
classification → merge → rate-limit check → agent (with vector retrieval) →
outbound send, with Airtable written at several points.

The knowledge base is a separate loop: Drive change → file extract → chunk →
embed → Supabase. Retrieval at query time reads the same store.

## Setup

1. Import `workflow.json`.
2. Replace `<GREEN_API_INSTANCE>` and `<GREEN_API_TOKEN>` in the send URL, and
   `<YOUR_WHATSAPP_ID>` where the destination is set.
3. Point `<AIRTABLE_BASE_ID_1>` and the four `<AIRTABLE_TABLE_ID_*>` values at
   your own base and tables.
4. Point `<GOOGLE_RESOURCE_ID_1>` at your knowledge-base Drive folder.
5. Connect all seven credentials listed below.
6. Provision the Supabase vector table and run one ingest before going live.

Credentials: Airtable Token API, Google Drive OAuth2, Google PaLM/Gemini API
(embeddings), Groq API, OpenAI API, Supabase API, Telegram API.

## Known issues

Read from the export as-is; nothing here is fixed in this copy.

### Security

- The webhook has no authentication. `Get Message` sets `options: {}` — no
  header auth, no basic auth, no signature verification. Anyone who learns the
  URL can POST arbitrary payloads that will be treated as genuine customer
  messages: consuming LLM credits, writing to Airtable, and triggering outbound
  WhatsApp sends. Given this workflow is `active: true`, this is the single
  most urgent item in the collection. Add header auth, and verify the
  provider's signature if Green API offers one.
- The Green API token was inline in the URL. Sanitized here, but it means every
  previous export of this file carried a live WhatsApp send credential. Rotate
  it and move it to a credential.

### Reliability

- 2 of 101 nodes have error handling. Only `Get Message` and `Chat with lead`
  configure `onError`/`retryOnFail`. In a 101-node graph handling live customer
  traffic, a failure almost anywhere drops the customer's message with no retry
  and no alert. `Add Failed Messages1` exists on the webhook's third output,
  which suggests the intent was there but was not extended through the graph.
- `Wait` nodes have no unit set. Three are `{"amount": 3}` with no `unit`
  field. n8n applies a default when the unit is absent, so the real delay is
  whatever that default is rather than something the JSON states. Confirm in
  the editor — the difference between 3 seconds and 3 hours matters a great
  deal in a customer conversation.

### Concurrency and multi-user

- The rate limiter is racy. `RateLimiter` is an Airtable `search`. Read,
  decide, then write is not atomic, so simultaneous messages from the same
  customer can both pass the check. Airtable offers no row locking to fix this.
- The agent's memory key is ambiguous. `Simple Memory` uses
  `sessionKey: {{ $('Merge').item.json.id }}`. If that `id` is a per-message
  identifier, conversation memory never persists across turns; if it is a
  per-customer identifier, it is correct. This cannot be determined from the
  export and should be checked first — it is the difference between a working
  conversational agent and one that forgets every message. If the field ever
  resolves to a shared or empty value, separate customers would share a memory
  buffer, which would be a privacy problem.
- Airtable's API allows ~5 requests/second per base. With 21 Airtable nodes
  and concurrent conversations, this ceiling is reachable. No backoff is
  configured.

### Unclear

- The classification logic and full routing between the 101 nodes were not
  traced node-by-node for this document. The flow above covers the trigger
  paths and the main spine; the branch detail should be read in the n8n editor.
- Whether the Supabase vector store is namespaced per customer or shared. If
  shared, retrieved context could surface one customer's document content to
  another.
