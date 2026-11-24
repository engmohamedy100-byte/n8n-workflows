# Job Application Form → Email Validation → Google Sheets

A three-part applicant pipeline: intake with CV upload, AI scoring against a
job description, and scheduled cleanup of old records.

- Source file: `Job Application Form -_ Email Validation -_ Google Sheets (with Cleanup) (1).json`
- 34 nodes, 3 triggers, exported inactive

## What it does

Three independent pipelines share one spreadsheet:

1. Intake — an n8n form takes name, email, position and a CV. The CV goes to
   Google Drive, the email format is validated, and valid applicants are
   appended to Sheets and emailed a confirmation.
2. Scoring — every minute, applicants marked "Under Reviewing" are picked up.
   Their CV and the job description are downloaded, text-extracted, and scored
   by an LLM, which writes back a status and a rationale.
3. Cleanup — daily at 03:00, old applications are removed from the sheet and
   their CV files deleted from Drive.

## Flow

Pipeline 1 — intake:
```
Job Application Form  (formTrigger)
  └─> Get row(s) in sheet          (duplicate check)
        └─> If
            └─[true]─> Code in JavaScript
                         └─> Upload file            (Google Drive, retryOnFail)
                               └─> Check Email Format
                                   ├─[valid]───> Add to Google Sheets ─> Send a message   (Gmail)
                                   └─[invalid]─> Invalid Email Message
```

Pipeline 2 — AI scoring (every 1 minute):
```
Schedule Trigger
  └─> Get Under Reviewing
        └─> Loop Over Items
              ├─> Get CV ─> Extract CV ─> JP ─> Get Job Discription
              └─> Get Job Discription1
                    ├─[ok]────> Extract Job Discription
                    │             └─> CV/Job
                    │                   └─> Score Candidates Against JD1   (LLM, retryOnFail)
                    │                         └─> Update Status/Why
                    │                               └─> (back to loop)
                    └─[error]─> Send a message1 ─> (back to loop)
```

Pipeline 3 — cleanup (daily 03:00):
```
Cleanup Trigger
  └─> Read All Applications
        └─> Mark Rows To Delete
              └─> Filter Rows To Delete
                    └─> Sort By Row Descending
                          └─> Loop Each Row
                                └─> Wait
                                      └─> Delete rows or columns from sheet
                                            └─> Delete a file    (Google Drive)
                                                  └─> (back to loop)
```

## Notable nodes

| Node | Type | Notes |
|---|---|---|
| Job Application Form | `formTrigger` | Public form, `Job Application Form`. Accepts a file upload. |
| Get row(s) in sheet / If | `googleSheets` / `if` | Duplicate-applicant check before writing. |
| Upload file | `googleDrive` | `retryOnFail: true`. Stores the CV. |
| Check Email Format | `if` | Format validation only — not deliverability. |
| Schedule Trigger | `scheduleTrigger` | `minutesInterval: 1`. See issues. |
| Extract CV / Extract Job Discription | `extractFromFile` | PDF → text. Both `onError: continueRegularOutput`. |
| Score Candidates Against JD1 | `chainLlm` | Scoring call, `retryOnFail: true`. |
| Structured Output Parser | `outputParserStructured` | Constrains the LLM response shape — good practice. |
| Sort By Row Descending | `sort` | Critical to correct deletion; see below. |
| Wait | `wait` | Throttles the delete loop against Sheets rate limits. |

The spreadsheet is the shared state between all three pipelines: intake writes
rows, scoring reads and updates them, cleanup deletes them. Google Drive holds
the CV binaries, referenced from the sheet by file id, which is why cleanup
must delete from both stores to avoid orphaned files.

Descending sort before deletion is a deliberate, correct detail: deleting sheet
rows shifts every row beneath upward, so deleting bottom-up keeps the remaining
indices valid. Deleting top-down would silently delete the wrong rows.

## Setup

1. Import `workflow.json`.
2. Point `<GOOGLE_RESOURCE_ID_9>` (applications sheet) and
   `<GOOGLE_RESOURCE_ID_10>` (Drive folder) at your own resources.
3. Connect Google Sheets, Google Drive, and Gmail OAuth2 credentials.
4. Connect Groq and OpenRouter credentials (both LLM providers are used).
5. Upload a job description to the location `Get Job Discription` expects.
6. Review the retention rule in `Mark Rows To Delete` before enabling — this
   pipeline deletes data permanently.

Credentials: Google Sheets OAuth2, Google Drive OAuth2, Gmail OAuth2, Groq API,
OpenRouter API.

## Multi-user behaviour

This is the workflow most exposed to concurrent use, since the form is public.

- The duplicate check is racy. `Get row(s) in sheet` → `If` → `Add to Google
  Sheets` is a read-then-write with no lock. Two people submitting the same
  email within the same second both read "not present" and both get appended.
- Concurrent submissions are otherwise independent. Each execution carries its
  own item, so there is no cross-request data bleed in the intake path.
- The 1-minute scorer can double-process. If a scoring pass takes longer than a
  minute, the next tick starts and re-reads rows still marked "Under
  Reviewing", scoring and billing them twice.

## Known issues

As exported; nothing here is fixed in this copy.

- A 1-minute schedule is very aggressive. It fires 1,440 times a day, mostly to
  find nothing, and each tick costs at least one Sheets read. Five minutes, or
  an event-driven trigger, would cut load substantially with no practical loss.
  This is also the direct cause of the double-processing risk above.
- Error handling is partial and inconsistent. 6 of 34 nodes configure it.
  `Extract CV` uses `continueRegularOutput`, which passes an empty extraction
  downstream rather than stopping, so a corrupt PDF can be scored as though the
  candidate submitted a blank CV. That failure is silent and produces a real,
  wrong score.
- Public form with no rate limiting or CAPTCHA. The endpoint accepts file
  uploads from anyone who has the URL. Nothing in the JSON limits submission
  rate, file size, or file type beyond what n8n enforces by default.
- No file-type validation before extraction. The form accepts an upload and the
  workflow assumes it is a readable PDF.
- Cleanup deletes irreversibly. Rows and Drive files are removed with no
  archive step. Combined with a retention rule that is not visible in the
  export, this deserves a careful read before enabling.
- Two LLM providers for one job. Groq and OpenRouter are both configured,
  doubling the credential surface. If this is a fallback arrangement it is not
  expressed as one in the JSON.
- Unclear: the exact retention condition in `Mark Rows To Delete`, and what
  distinguishes `Get Job Discription` from `Get Job Discription1`. Both are
  worth reading in the editor before use.
