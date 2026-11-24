# Appointment Reminders — Google Sheets (every 15 min)

Sends each client one email reminder roughly 24 hours before and one roughly 1
hour before their appointment, reading the same Bookings sheet the
[booking workflow](../appointment-booking-google-sheets/) writes.

- **Source file:** `workflow.json`
- **Internal name:** `Appointment Reminders - Google Sheets (every 15 min)`
- **Nodes:** 8 · **Trigger:** Schedule (15 min) · **Status in export:** inactive

## What it does

Every 15 minutes the workflow reads the Bookings tab and picks rows whose start
time falls inside one of two windows: 21–24 hours away (day-before stage, with a
3-hour grace in case n8n was down) or 0–60 minutes away (starting-soon stage).
It sends a themed HTML email per stage and only then writes the stage into the
row's `Reminder Sent` column — so a failed send is retried on the next run
instead of being lost. Canceled bookings are never reminded because the status
is checked live, and a moved booking is reminded again because the booking
workflow clears the column.

## Flow

```
Every 15 Minutes ─> Config ─> Read Bookings ─> Pick Reminders ─> Send Reminder
                                                                  ├─[ok]───> Mark Reminder Sent
                                                                  └─[fail]─> Email failed - retry next run (noOp)
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Every 15 Minutes | `scheduleTrigger` | 15-minute interval. |
| Config | `set` | `businessName`, `ownerEmail`, `formUrl`, `sheetId`, `timezone`, `locationText`. |
| Read Bookings | `googleSheets` | Reads the whole Bookings tab. **Exported without credentials — attach yours.** |
| Pick Reminders | `code` | Window logic, per-stage email HTML (escaped), handles Sheets serial dates/times. |
| Send Reminder | `gmail` | Continues to the error output on failure. |
| Mark Reminder Sent | `googleSheets` | Writes the stage key into `Reminder Sent` only after a real send. |
| Email failed - retry next run | `noOp` | Documents the retry semantics; deliberately does nothing. |

## Setup

1. Import `workflow.json`.
2. Open **Config** and fill `businessName`, `ownerEmail`, `formUrl`, `sheetId`
   and `timezone`.
3. Attach Google Sheets credentials to both Sheets nodes and a Gmail OAuth2
   credential to **Send Reminder**.
4. The Bookings tab needs a `Reminder Sent` column; stages are stored there as
   comma-separated keys (`24h`, `1h`).

## Credentials required

- Gmail OAuth2
- Google Sheets OAuth2

## Known issues

Read from the JSON as exported; nothing here is fixed in this copy.

- **A persistently failing address retries forever.** The column is marked only
  after a successful send, so a bad client email is retried every 15 minutes
  with no attempt cap and no owner alert.
- **A long outage skips the day-before reminder.** The 24h stage has a 3-hour
  grace; beyond that only the 1h reminder fires.
- **Reminder state is one shared column.** Anything else that writes
  `Reminder Sent` — including a human editing the sheet — changes what gets
  sent.
- **Config is duplicated.** `businessName`, `sheetId` and `timezone` are set
  here and in the booking workflow separately and can drift apart.
- **No error workflow configured.** `Read Bookings` is set to continue on error,
  so a failed sheet read flows into the Code node; the run then fails without
  notifying anyone.
