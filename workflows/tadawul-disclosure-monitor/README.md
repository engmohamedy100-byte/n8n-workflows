# Tadawul Disclosure Monitor

Polls the Saudi Exchange (Tadawul) for new company disclosures, summarizes each
with an LLM, and emails an alert — with duplicate suppression.

- Source file: `Tadawul Disclosure Monitor — AI Financial Alert System.json`
- 24 nodes, schedule trigger (every 30 minutes), exported inactive

## What it does

Every 30 minutes it reads a watchlist of companies from Google Sheets, runs an
Apify actor against the Saudi Exchange for each active company, and checks
whether anything was disclosed today. New disclosures are fetched in full via a
RAG web browser, analyzed by an LLM, emailed as an alert, and recorded so the
same disclosure is never sent twice.

## Flow

```
Schedule Trigger  (every 30 min)
  └─> Get Watchlist              (Google Sheets)
        └─> Filter Active Companies
              └─> Loop Over Companies
                    ├─[done]─> All Companies Done
                    └─[each]─> Build Apify Input
                                 └─> Call Apify Actor          ──[error]──> Log Error
                                       └─> Current Date?
                                             ├─[no]──> Continue Loop
                                             └─[yes]─> Normalize Actor Response
                                                         └─> Has Disclosure Today?
                                                             ├─[no]──> No Disclosure - Skip ─> Continue Loop
                                                             └─[yes]─> Split Disclosures
                                                                         └─> Search Processed Sheet  ──[error]──> Log Error
                                                                               └─> Already Processed?
                                                                                   ├─[yes]─> Duplicate - Skip ─> Continue Loop
                                                                                   └─[no]──> RAG Web Browser
                                                                                               └─> Extract Disclosure Text
                                                                                                     └─> Analyze Disclosure  ──[error]──> Log Error
                                                                                                           └─> Build Email Content
                                                                                                                 └─> Send Alert Email  ──[error]──> Log Error
                                                                                                                       └─> Save Processed Disclosure  ──[error]──> Log Error
                                                                                                                             └─> Continue Loop
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Schedule Trigger | `scheduleTrigger` | `minutesInterval: 30`. |
| Get Watchlist | `googleSheets` | Companies to monitor. |
| Filter Active Companies | `filter` | Drops inactive rows before any paid call. |
| Loop Over Companies | `splitInBatches` | One company per iteration. |
| Build Apify Input | `set` | Actor payload. |
| Call Apify Actor | `httpRequest` | `generous_heavens~tadawul-disclosure-monitor-saudi-exchange`. `onError: continueErrorOutput`. |
| Current Date? / Has Disclosure Today? | `if` | Date gating. |
| Split Disclosures | `splitOut` | One item per disclosure. |
| Search Processed Sheet | `googleSheets` | Duplicate lookup. `onError: continueErrorOutput`. |
| Already Processed? | `if` | Dedup gate. |
| RAG Web Browser | `httpRequest` | `apify~rag-web-browser`. `retryOnFail: true`. |
| Extract Disclosure Text | `code` | Pulls readable text from the fetch. |
| Analyze Disclosure | `chainLlm` | Groq-backed summary/assessment. `onError: continueErrorOutput`. |
| Build Email Content | `code` | Formats the alert. |
| Send Alert Email | `gmail` | `onError: continueErrorOutput`. |
| Save Processed Disclosure | `googleSheets` | Records the disclosure so it is not re-sent. |
| Log Error | `noOp` | Shared error sink for five branches. |
| Continue Loop | `noOp` | Loop-back convergence point. |

The watchlist drives everything. Inside each loop iteration the data narrows
through a series of gates — active → has disclosure → dated today → not already
processed — so the expensive steps (RAG fetch, LLM analysis) only run on
genuinely new material. `Save Processed Disclosure` is the state that makes the
dedup gate work across runs; without it, every 30-minute cycle would re-alert
on the same disclosure.

This is the best-engineered workflow in the collection. 6 of 24 nodes have
explicit error handling, five failure paths converge on a single `Log Error`
sink, and every path returns to `Continue Loop`, so one company failing does
not stop the rest. That pattern is worth copying into the others.

## Setup

1. Import `workflow.json`.
2. Point `<GOOGLE_RESOURCE_ID_12>` at your spreadsheet — it holds the watchlist
   and the processed-disclosure log across several tabs (`gid`s differ).
3. Connect Google Sheets OAuth2, Gmail OAuth2, and Groq credentials.
4. Add your Apify token as the `httpHeaderAuth` credential.
5. Set the alert recipient (sanitized to `you@example.com`).

Credentials: Google Sheets OAuth2, Gmail OAuth2, Groq API, HTTP Header Auth
(Apify token).

## Known issues

As exported; nothing here is fixed in this copy.

- `Log Error` is a `noOp`. Five error paths route into it, and it does nothing
  — no email, no sheet row, no Telegram. Failures are therefore invisible
  unless someone opens the n8n execution list. Making this node write a row or
  send a message would convert silent failure into a real alert.
- Dedup has a race window. `Search Processed Sheet` reads, and `Save Processed
  Disclosure` writes, with the RAG fetch, LLM call, and email in between. Two
  overlapping executions can both read "not processed" and both send. Which
  leads to the next point.
- A 30-minute schedule can overlap. Each cycle serializes: N companies × (1
  Apify call + optional RAG fetch + LLM call + email + 2 sheet ops). With a
  sizeable watchlist that can exceed 30 minutes, and n8n will start the next
  run while the previous is still going, duplicating alerts. Either cap the
  watchlist, raise the interval, or add a run-in-progress guard.
- Retry without backoff. `RAG Web Browser` sets `retryOnFail: true` with no
  `maxTries` and no delay shown, so a rate-limited endpoint gets hammered.
- Google Sheets as a transactional store. The Sheets API allows roughly 60
  writes/minute/user. A busy disclosure day plus per-company status writes can
  approach that, and Sheets offers no row-level locking to make the dedup check
  safe.
- Unclear: the exact tabs behind each `gid`, and whether `Analyze Disclosure`
  constrains the LLM to a structured output. Financial alerts derived from an
  unconstrained summary should be reviewed before anyone trades on them.
