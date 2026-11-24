# Job Search via RapidAPI (JSearch)

Pulls job listings from the JSearch API, logs them to Google Sheets, and
messages a lead over WhatsApp.

- Source file: `Search for jobs using Rabid.json`
- 6 nodes, manual trigger, exported inactive

A demo-scale job-search fetcher. One manual run queries JSearch, flattens the
result array, appends every listing to a spreadsheet, and sends a WhatsApp
message about a lead.

## Flow

```
When clicking 'Execute workflow'
  └─> HTTP Request  (JSearch: /search-v2)
        └─> Split Out  (one item per listing)
              ├─> Append row in sheet   (Google Sheets)
              └─> Edit Fields
                    └─> Chat with lead  (Green API / WhatsApp)
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| When clicking 'Execute workflow' | `manualTrigger` | No schedule; runs only when started by hand. |
| HTTP Request | `httpRequest` | `POST https://jsearch.p.rapidapi.com/search-v2`. Key was inline in `x-rapidapi-key` — now `<RAPIDAPI_KEY>`. |
| Split Out | `splitOut` | Expands the response array into one item per job. |
| Append row in sheet | `googleSheets` | Appends each listing. Uses `googleSheetsOAuth2Api`. |
| Edit Fields | `set` | Builds the message body. |
| Chat with lead | `httpRequest` | Green API WhatsApp send. `retryOnFail: true`, `maxTries: 2`, `onError: continueErrorOutput`. |

`HTTP Request` returns a single item holding an array of listings. `Split Out`
fans that into N items, and the two downstream branches each receive all N. So
`Append row in sheet` performs one append per listing, and `Chat with lead`
sends one WhatsApp message per listing — keep that in mind before running it
against a big result set.

## Setup

1. Import `workflow.json` into n8n.
2. Replace `<RAPIDAPI_KEY>` with your own RapidAPI key. Prefer an n8n
   credential over an inline header — see the first issue below.
3. Replace `<GREEN_API_INSTANCE>` and `<GREEN_API_TOKEN>` in the Green API URL.
4. Replace `<YOUR_WHATSAPP_ID>@c.us` with the destination chat id.
5. Point `<GOOGLE_RESOURCE_ID_11>` at your spreadsheet and connect a Google
   Sheets OAuth2 credential.

Credentials: Google Sheets OAuth2, a RapidAPI key (currently an inline header,
not an n8n credential), and a Green API instance id + token (currently inline
in the URL).

## Known issues

- Secrets were inline, not credentials. Both the RapidAPI key and the Green API
  token were literals in node parameters, so they travelled with every export.
  Move them to n8n credentials (Header Auth for RapidAPI) so exports stay
  clean.
- The WhatsApp branch fans out. Because `Split Out` feeds `Edit Fields`
  directly, one message is sent per listing. A 20-result search sends 20
  WhatsApp messages. If the intent was one summary message, aggregate first.
- No rate limiting between sends. The messages fire as fast as n8n iterates.
  Green API throttles per instance, and a large result set can hit that limit.
  `Chat with lead` retries twice on failure, which under a 429 makes the burst
  worse rather than better.
- Errors are swallowed on the sheet branch. `Append row in sheet` has no
  `onError` setting, so a Sheets failure aborts the run with listings already
  partly written.
- No deduplication. Re-running appends the same listings again.
- Unclear: the JSearch query parameters are not visible in the node's top-level
  `url`; whether the search terms are hardcoded or built upstream is not
  determinable from the export alone.
