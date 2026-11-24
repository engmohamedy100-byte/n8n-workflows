# Appointment Booking — Google Sheets (book / change / cancel)

A multi-step n8n Form that lets clients book, change or cancel an appointment.
Google Calendar is the source of truth for free/busy time, Google Sheets is the
database, and Gmail sends every confirmation and alert.

- **Source file:** `workflow.json`
- **Internal name:** `Appointment Booking - Google Sheets (book / change / cancel)`
- **Nodes:** 63 · **Trigger:** n8n Form (+ error trigger) · **Status in export:** inactive

## What it does

The client opens the form link, enters their email and picks **book**, **change**
or **cancel**. New bookings and changes walk through three form steps — service,
day, then a time picker built from the calendar's real free slots. Before
anything is saved the chosen slot is re-checked against the calendar, because
someone else may have taken it while the client was filling the form. Cancels
ask for confirmation, then remove the event and mark the row.

Every save has a failure path: if the calendar write fails the client is told
the booking did not go through, and if the sheet write fails after the event was
created, the event is deleted again (rollback) and the owner gets an alert
email. An Error Trigger covers everything the nodes don't handle and emails the
owner.

## Flow

```
Start Form (email + book/change/cancel)
  └─> Config ─> Read Request ─> Valid Request?
        ├─[no]───────────────> Done - Error
        └─[yes]─> Read Bookings ─> Process Bookings ─> Route
              ├─[book/change]─> Read Services ─> Build Service Form ─> Services OK?
              │     └─[yes]─> Booking Details ─> Day Window ─> Day OK?
              │           └─[yes]─> Get Busy Times ─> Build Free Slots ─> Any Free Time?
              │                 ├─[no]──> Done - Info
              │                 └─[yes]─> Pick Time ─> Prepare Booking ─> Re-check Slot ─> Decide ─> Confirmed?
              │                       ├─[no]──> Build Reject Email ─> Email Client - Rejected ─> Done - Rejected
              │                       └─[yes]─> Add to Calendar ─┬─(fail)─> Calendar Failed ─> alert owner ─> reject path
              │                                                  └─> Is Change?
              │                                                        ├─[change]─> Update Booking Row ─> Delete Old Event ─┐
              │                                                        │                    └─(fail)─> Sheet Failed ─┐        │
              │                                                        └─[book]───> Save Booking ─> Save Client ─────┤        │
              │                                                                             └─(fail)─> Sheet Failed ─┤        │
              │                                                                                                      ▼        ▼
              │                                                          Rollback Event ─> alert owner ─> reject path      Build Emails
              │                                                                                                             │
              │                                              Email Client - Confirmed ─> Email Owner ─> Done - Confirmed <──┘
              ├─[cancel]─> Build Cancel Form ─> Confirm Cancel ─> Resolve Cancel ─> Cancel Decision
              │     ├─[cancel]─> Cancel: Update Sheet ─┬─(fail)─> Build Cancel Alert ─> owner ─> Done - Cancel Failed
              │     │                                  └─> Cancel: Delete Event ─> Build Cancel Emails ─> emails ─> Done - Canceled
              │     └─[keep]──> Done - Kept
              └─[nothing to do]─> Done - Info

Error Trigger ─> Build Error Alert ─> Email Owner - Workflow Error
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Start Form | `formTrigger` | Entry point. Email plus the book/change/cancel choice. |
| Config | `set` | All settings: business name, owner email, calendar id, sheet id, form URL, timezone, opening hours, limits. |
| Read Request / Process Bookings | `code` | Parse the form, read the client's upcoming bookings from the sheet, decide the route. Handles Google Sheets turning date/time cells into serial numbers. |
| Route | `switch` | book / change / cancel / nothing-to-do / error. |
| Read Services + Build Service Form | `googleSheets` + `code` | Step 1 is built dynamically from the Services tab. |
| Get Busy Times / Re-check Slot | `googleCalendar` | Free/busy reads. The re-check runs right before saving. |
| Build Free Slots / Pick Time | `code` + `form` | Slot list from opening hours minus busy time, step 2 of the form. |
| Add to Calendar / Delete Old Event / Rollback Event | `googleCalendar` | Create, replace on change, delete on failure. |
| Save Booking / Update Booking Row / Save Client | `googleSheets` | Bookings and Clients tabs. **Exported without credentials — attach yours.** |
| Build Emails and the alert builders | `code` | Escaped, table-based HTML emails with per-case themes. |
| Email * (9 nodes) | `gmail` | Client confirmations/rejections and owner alerts. |
| Done - * (8 nodes) | `form` | Closing screens for every outcome. |
| Error Trigger + Build Error Alert | `errorTrigger` + `code` | Global safety net; emails the owner on any unhandled failure. |

## Data flow

The Bookings tab holds one row per appointment (status included); the Services
tab defines what can be booked; the Clients tab is upserted on each confirmed
booking. Moving a booking clears its reminder flag, which the companion
[appointment-reminders-google-sheets](../appointment-reminders-google-sheets/)
workflow relies on.

## Setup

1. Import `workflow.json`.
2. Open **Config** and fill `businessName`, `ownerEmail`, `calendarId`,
   `formUrl` (the production URL of **Start Form**) and `sheetId`.
3. Attach a Google Sheets credential to the 6 Sheets nodes — the export lost
   them.
4. Attach Gmail and Google Calendar OAuth2 credentials where asked.
5. Create the sheet with the tabs **Bookings**, **Services**, **Clients** and
   their header rows.
6. In the workflow's **Settings → Error workflow**, choose this same workflow,
   and set `OWNER_EMAIL` inside **Build Error Alert** to match `ownerEmail`.
7. Opening hours, closed days, slot step and booking limits live in **Config**.

## Credentials required

- Gmail OAuth2
- Google Calendar OAuth2
- Google Sheets OAuth2

## Known issues

Read from the JSON as exported; nothing here is fixed in this copy.

- **Identity is the client's email address, nothing more.** Anyone who knows or
  guesses a client's email can view, change or cancel that client's bookings
  through the form. Acceptable for a low-stakes booking page, not for anything
  sensitive — add a verification code step if it matters.
- **Sheets is not a transactional store.** The slot re-check prevents the common
  double-booking, but two clients finishing the form in the same seconds can
  still race the sheet writes; there is no locking.
- **Whole-sheet reads on every submission.** `Read Bookings` pulls the full tab
  each run. Fine at hundreds of rows, slower as it grows.
- **A failed client email is silent.** The Gmail nodes continue on error, so if
  the client's confirmation fails to send, the booking stands but the client
  hears nothing. Owner alerts are separate and do not cover this case.
- **Two places hold the owner address.** `ownerEmail` in Config and
  `OWNER_EMAIL` inside Build Error Alert must match, and the error workflow only
  fires if you wire it in Settings — both are manual steps that are easy to skip.
- **Single timezone.** Everything uses the Config timezone (`Africa/Cairo` as
  exported), including for clients elsewhere.
