# End-to-End AI Sales Automation Pipeline

A full sales lifecycle automation — lead capture, enrichment, meeting
follow-up, contract, and onboarding — built on Notion as the CRM with Telegram
for internal coordination.

- Source file: `End-to-End AI Sales Automation Pipeline .json`
- Internal name: `AI Sales Automation  End_To_End`
- 109 nodes, 9 triggers, exported inactive

This is the largest workflow in the collection and the most
trigger-fragmented.

## What it does

Nine entry points feed one Notion-centred CRM. Leads arrive from forms, a
Google Sheet, Notion changes, Gmail, or Telegram; an AI agent enriches them
using web search; meetings, contracts and onboarding each have their own form
and follow-up path; Google Docs and Drive are used to generate and file
documents; Telegram carries internal notifications throughout.

## Triggers

| Trigger | Type | Purpose |
|---|---|---|
| On form submission1 | `formTrigger` | "Workflow Launcher" |
| On form submission | `formTrigger` | "After Meeting Form" |
| On form submission2 | `formTrigger` | "Contract Form" |
| On form submission3 | `formTrigger` | "On-boarding Form" |
| Notion Trigger | `notionTrigger` | CRM database changes |
| Google Sheets Trigger | `googleSheetsTrigger` | New rows |
| Gmail Trigger | `gmailTrigger` | Inbound mail |
| Google Calendar Trigger | `googleCalendarTrigger` | Meeting events |
| Telegram Trigger1 | `telegramTrigger` | Inbound Telegram commands |

## Key node groups

| Group | Count | Purpose |
|---|---|---|
| `notion` | 21 | CRM reads, page creation, status updates. |
| `telegram` | 16 | Internal notifications and interaction. |
| `if` / `switch` | 15 | Stage routing across the lifecycle. |
| `googleDrive` | 7 | Document filing. |
| `chainLlm` | 6 | Content generation at several stages. |
| `googleSheets` | 6 | Reporting and intake. |
| `gmail` | 5 | Outbound email. |
| `googleDocs` | 3 | Proposal/contract document generation. |
| `splitInBatches` | 3 | Batch loops. |
| `httpRequestTool` | 1 | Serper web search, exposed as an agent tool. |

## Architecture

Rather than one spine, this is several stage-pipelines sharing a Notion
database:

```
Workflow Launcher form ─┐
Google Sheets Trigger  ─┼─> lead intake ─> Notion CRM page
Notion Trigger         ─┘                     │
                                              ├─> AI Agent (+ Serper web_search tool)
                                              │     └─> enrichment written back to Notion
                                              │
Google Calendar Trigger ──> meeting prep ─────┤
After Meeting Form      ──> follow-up ────────┤
Contract Form           ──> Google Docs ──────┤──> Google Drive filing
On-boarding Form        ──> onboarding tasks ─┤
Gmail Trigger           ──> inbound handling ─┤
Telegram Trigger1       ──> internal commands ┘
                                              └─> Telegram notifications throughout
```

Notion is the shared state. Each stage pipeline reads the relevant CRM page,
performs its work, and writes status back — which is what lets nine independent
triggers cooperate. `Update a database page` nodes mostly address pages by
expression (`{{ $('Notion Trigger').item.json.id }}`), so each execution acts
on the page that triggered it.

The AI agent is given a `web_search` tool pointing at Serper, letting it enrich
leads with live search results rather than model knowledge alone.

## Setup

1. Import `workflow.json`.
2. Replace `<SERPER_API_KEY>` in the `web_search` node's `X-API-KEY` header —
   ideally by moving it to a Header Auth credential instead of an inline value.
3. Point the five `<NOTION_PAGE_ID_*>` placeholders at your own databases.
4. Point the five `<GOOGLE_RESOURCE_ID_*>` values at your Sheets, Docs and
   Drive folders.
5. Replace `<YOUR_TELEGRAM_CHAT_ID>` (16 occurrences) and
   `<YOUR_GOOGLE_CALENDAR_ID>`.
6. Connect all ten credentials listed below.
7. Bring up one stage at a time — enabling all nine triggers at once makes
   failures very hard to attribute.

Credentials: Notion OAuth2, Telegram API, Gmail OAuth2, Google Sheets OAuth2
(+ separate Sheets Trigger OAuth2), Google Drive OAuth2, Google Docs OAuth2,
Google Calendar OAuth2, Groq API, OpenRouter API.

Ten credential types across one workflow is a large blast radius: any one
revoked token breaks a stage, and the failure will not be obvious.

## Known issues

Read from the export as-is; nothing here is fixed in this copy.

### Reliability

- 5 of 109 nodes have error handling. `AI Agent` (`retryOnFail`, `maxTries: 2`)
  and `Get many database pages1` are the only retrying nodes; three others set
  `continueRegularOutput`. Across nine pipelines touching seven external
  services, the overwhelming majority of failure paths are unhandled — a stage
  fails silently and the CRM is left mid-transition.
- `continueRegularOutput` hides failures. On `Basic LLM Chain4` and `Add Row1`
  it passes empty output downstream instead of stopping, so a failed generation
  can be written to Notion as a blank field rather than raising an error.
- No dead-letter path. Nothing collects failed executions for replay.

### Security

- The Serper key was inline in a header. Sanitized here; rotate it and move it
  to a credential.
- Four public form endpoints. None show rate limiting or CAPTCHA in the JSON.
  Contract and On-boarding forms in particular should not be openly
  submittable.

### Concurrency and multi-user

- Nine triggers on one Notion database invite write races. Notion has no
  transactions. A Calendar trigger and a form submission touching the same page
  simultaneously will last-write-wins, silently discarding one update.
- Notion's API allows ~3 requests/second. With 21 Notion nodes and several
  pipelines potentially active at once, this is reachable, and no backoff is
  configured.
- The Notion trigger can self-fire. Several pipelines write back to the same
  database the `Notion Trigger` watches. Whether the trigger's filter excludes
  the workflow's own writes is not visible in the export — if it does not, a
  feedback loop is possible. Check this before enabling.
- Telegram chat id is a single hardcoded value (16 occurrences), so all
  notifications go to one destination. Fine for a solo operator; it does not
  support a team without change.

### Unclear

- The full routing across 109 nodes was not traced node-by-node for this
  document. Stage boundaries and trigger paths are documented above; the
  internal branch logic of each stage should be read in the n8n editor.
- Whether the four forms feed distinct Notion databases or all write to the CRM
  database.
- The three `googleDocs` nodes generate documents from templates whose ids are
  now placeholders; the template structure is not part of this export.
