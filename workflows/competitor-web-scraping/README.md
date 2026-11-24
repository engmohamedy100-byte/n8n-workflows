# Competitor Web Scraping (متابعة المنافس)

Monthly price/stock watch on a competitor's product page, with change detection
in Supabase and email alerts.

- Source file: `Follow المنافس _web scraping (1).json`
- 11 nodes, monthly schedule trigger, exported inactive

## What it does

Once a month it fetches a competitor product page, parses the listings out of
the HTML, and compares each against a Supabase table. New products are inserted
and announced by email; products whose price changed trigger a different email.

## Flow

```
Schedule Trigger  (interval: months)
  └─> Edit Fields          (sets website_url and the fields to watch)
        └─> HTTP Request   (GET the competitor page)
              └─> Code in JavaScript   (parse HTML -> product records)
                    └─> Get many rows  (Supabase: existing products)
                          └─> If  (does this product already exist?)
                                ├─[false]─> Create a row  (Supabase insert)
                                │             └─> new item        (Gmail alert)
                                └─[true]──> If1  (has the price changed?)
                                              └─[true]─> Edit Fields1
                                                           └─> change pricing  (Gmail alert)
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Schedule Trigger | `scheduleTrigger` | `{"interval":[{"field":"months"}]}` — monthly, no day/hour pinned. |
| Edit Fields | `set` | Defines `website_url`, consumed by the HTTP node as an expression. |
| HTTP Request | `httpRequest` | URL is `={{ $('Edit Fields').item.json.website_url }}`. Plain GET, no auth. |
| Code in JavaScript | `code` | Parses the response into product records. Custom, brittle to markup changes. |
| Get many rows | `supabase` | Reads known products for comparison. |
| If | `if` | New product vs. already tracked. |
| Create a row | `supabase` | Inserts newly-seen products. |
| If1 | `if` | Price-change check on existing products. |
| Edit Fields1 | `set` | Builds the change-alert payload. |
| new item / change pricing | `gmail` | The two alert emails. |

One wiring detail worth knowing: `Edit Fields` seeds the target URL, which
`HTTP Request` reads by expression rather than by connection order, so the HTTP
node depends on `Edit Fields` having run in the same execution. The `Code` node
converts raw HTML into structured items, and every downstream node operates per
item. Supabase is the state store: it is what makes "new" and "changed"
meaningful across runs.

## Setup

1. Import `workflow.json`.
2. Set `website_url` in `Edit Fields` to the page you want to watch.
3. Create the Supabase table the workflow expects (`competitor_products`) and
   connect a Supabase credential.
4. Connect a Gmail OAuth2 credential. Recipients were `you@example.com` after
   sanitization — set your own.
5. Review the parsing logic in `Code in JavaScript` against your target page.

Credentials: Supabase API, Gmail OAuth2.

## Known issues

As exported; none of this is fixed in this copy.

- No error handling anywhere. 0 of 11 nodes set `onError`, `retryOnFail`, or
  `continueOnFail`. If the competitor site returns 503, or the markup shifts
  and the `Code` node throws, the run dies silently and no alert is sent. A
  monthly schedule means you may not notice for a month.
- Scraping without a User-Agent or timeout. The HTTP node sets no custom
  headers. Many sites block default clients, and n8n's request has no explicit
  timeout, so a hanging response ties up an execution slot.
- Parsing is markup-coupled. Any redesign of the target page silently produces
  zero items, which reads as "no changes" rather than as a failure. A guard
  that errors when the parse yields 0 products would make this visible.
- The schedule has no anchor. `{"field":"months"}` with no `triggerAtDay` or
  `triggerAtHour` leaves the exact fire time to n8n's defaults, which is worth
  pinning explicitly if the timing matters.
- Monthly polling may miss changes. A price that moves and moves back within
  the month is invisible to this design.
- Unclear: the Supabase comparison keys. Whether products are matched by URL,
  SKU, or title is decided inside `Code in JavaScript` and the Supabase
  filters; the export does not make the matching key obvious, and a weak key
  would cause duplicate inserts.
