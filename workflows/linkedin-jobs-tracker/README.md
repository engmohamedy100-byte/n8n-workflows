# LinkedIn Jobs Tracker

Reads a list of companies from Google Sheets, counts their live LinkedIn
postings, scrapes the jobs via an Apify actor, and upserts them back to Sheets.

- **Source file:** `Follow_LinkedIn Jobs.json`
- **Internal name:** `New Version_Eng.omar`
- **Nodes:** 16 · **Trigger:** manual · **Status in export:** inactive

## What it does

For each company row in a tracking sheet, it resolves the LinkedIn company id,
checks how many jobs are actually posted, and only spends an Apify call when the
count is above zero. Scraped jobs are written to a jobs sheet keyed by `job_id`,
and the company's status row is updated either way.

## Flow

```
Manual / Schedule Trigger
  └─> Google Sheets - Read Companies
        └─> Loop Over Companies (1 at a time)
              └─> Code - Resolve Company ID
                    └─> Code - Count Actual LinkedIn Jobs
                          └─> IF Count > 0
                              ├─[true]──> Set - Build Apify Input
                              │             └─> HTTP - Run Apify Actor (sync)
                              │                   └─> Code - Map Job Fields
                              │                         └─> Aggregate - Collect All Jobs For Row
                              │                               └─> Code - Verify Counts
                              │                                     ├─> Split Out - One Item Per Job
                              │                                     │     └─> Google Sheets - Upsert Jobs (dedup by job_id)
                              │                                     └─> Google Sheets - Update Status Row
                              │                                           └─> (back to loop)
                              └─[false]─> Set - Mark Skipped (0 jobs, no Apify call)
                                            └─> (back to loop)
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Manual / Schedule Trigger | `manualTrigger` | Named "Schedule" but is a manual trigger — no schedule is configured. |
| Google Sheets - Read Companies | `googleSheets` | Source list of companies to track. |
| Loop Over Companies | `splitInBatches` | Processes one company per iteration. |
| Code - Resolve Company ID | `code` | Derives the LinkedIn company identifier. |
| Code - Count Actual LinkedIn Jobs | `code` | Pre-check so zero-job companies skip the paid scrape. |
| IF Count > 0 | `if` | The cost guard. |
| Set - Build Apify Input | `set` | Assembles the actor payload. |
| HTTP - Run Apify Actor | `httpRequest` | `run-sync-get-dataset-items` on `worldunboxer~rapid-linkedin-scraper`. Auth via `httpQueryAuth`. |
| Code - Map Job Fields | `code` | Normalizes actor output. |
| Aggregate | `aggregate` | Collects all jobs for the current company. |
| Code - Verify Counts | `code` | Cross-checks scraped count against the expected count. |
| Split Out - One Item Per Job | `splitOut` | Fans out for the upsert. |
| Google Sheets - Upsert Jobs | `googleSheets` | Deduplicates on `job_id`. |
| Google Sheets - Update Status Row | `googleSheets` | Writes per-company status, then returns to the loop. |

## Data flow

The `splitInBatches` loop is the backbone: both the success and skip branches
route back into it, so companies are processed strictly one at a time. Inside an
iteration, data goes single item → array (Apify) → aggregated → split again for
row-level upserts. The `Aggregate` → `Verify Counts` → `Split Out` sequence exists
so the count check can see the whole set before rows are written.

Two design choices here are genuinely good and worth calling out: the count
pre-check avoids paying for empty scrapes, and `job_id` deduplication makes the
upsert safe to re-run.

## Setup

1. Import `workflow.json`.
2. Point `<GOOGLE_RESOURCE_ID_7>` (companies) and `<GOOGLE_RESOURCE_ID_8>` (jobs)
   at your own spreadsheets.
3. Connect a Google Sheets OAuth2 credential.
4. Add your Apify token as the `httpQueryAuth` credential.
5. Confirm the column names the `Code` nodes expect match your sheet headers.

## Credentials required

- Google Sheets OAuth2
- HTTP Query Auth (Apify token)

## Known issues

Read from the JSON as exported; nothing here is fixed in this copy.

- **No error handling anywhere.** 0 of 16 nodes set `onError` or `retryOnFail`.
  One Apify timeout aborts the entire run, and every company after the failing
  one goes unprocessed. In a loop like this, `onError: continueRegularOutput` on
  the Apify call plus an error-log branch would let the run finish.
- **Synchronous Apify calls inside a loop.** `run-sync-get-dataset-items` blocks
  until the actor finishes. With N companies this serializes N scrapes into one
  execution, and n8n's execution timeout becomes the real limit on list size.
- **The trigger name is misleading.** "Manual / Schedule Trigger" is a
  `manualTrigger`. Nothing runs on a schedule until a schedule trigger is added.
- **Apify concurrency and credit limits are unguarded.** There is no backoff. If
  the account's actor-run concurrency is reached, the call fails and takes the
  run with it.
- **LinkedIn scraping carries terms-of-service risk** independent of the code.
  Worth confirming your use is within LinkedIn's terms and the actor's own limits.
- **Unclear:** how `Code - Resolve Company ID` and `Code - Count Actual LinkedIn
  Jobs` obtain their data. Whether they call an endpoint or read pre-filled sheet
  columns is not determinable from the structural export.
