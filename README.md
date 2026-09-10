# n8n Workflows

A collection of eight production n8n automations covering AI customer service,
sales pipeline automation, recruitment, job search, competitor monitoring and
financial alerting.

Every workflow here is **sanitized**: API keys, personal data and
instance-specific resource ids have been replaced with named placeholders. Each
one ships with documentation covering what it does, how data moves through it,
and what is wrong with it.

## Workflows

| Workflow | Nodes | Trigger | What it does |
|---|---:|---|---|
| [End-to-End Sales Pipeline](workflows/end-to-end-sales-pipeline/) | 109 | 9 triggers | Full sales lifecycle on Notion — lead capture through onboarding. |
| [AI Customer Service & Sales](workflows/ai-customer-service-sales-system/) | 101 | Webhook + 4 | Arabic WhatsApp agent with RAG over Supabase, Airtable CRM. |
| [Job Application Pipeline](workflows/job-application-form-pipeline/) | 34 | Form + 2 schedules | Applicant intake, AI CV scoring, scheduled cleanup. |
| [Tadawul Disclosure Monitor](workflows/tadawul-disclosure-monitor/) | 24 | Schedule (30 min) | Saudi Exchange disclosure alerts with LLM analysis. |
| [Gmail Triage & Auto-Reply](workflows/gmail-triage-auto-reply/) | 17 | Gmail | Classifies mail, labels it, drafts or sends an AI reply. |
| [LinkedIn Jobs Tracker](workflows/linkedin-jobs-tracker/) | 16 | Manual | Scrapes company job postings via Apify into Sheets. |
| [Competitor Web Scraping](workflows/competitor-web-scraping/) | 11 | Schedule (monthly) | Price/stock change detection with email alerts. |
| [Job Search (RapidAPI)](workflows/job-search-rapidapi/) | 6 | Manual | JSearch listings to Sheets and WhatsApp. |

318 nodes total.

## Stack

**Orchestration:** n8n
**AI:** OpenAI, Groq, OpenRouter, Google Gemini embeddings
**Data:** Airtable, Notion, Supabase (pgvector), Google Sheets
**Messaging:** WhatsApp (Green API), Telegram, Gmail
**Scraping/search:** Apify, Serper.dev, RapidAPI

## Using a workflow

1. Import the workflow's `workflow.json` into your n8n instance.
2. Open its README and work through the **Setup** section.
3. Replace every `<PLACEHOLDER>` value with your own resource ids.
4. Create the credentials listed under **Credentials required**.
5. Read the **Known issues** section before enabling anything on live data.

### Placeholder convention

| Placeholder | Meaning |
|---|---|
| `<SERPER_API_KEY>`, `<RAPIDAPI_KEY>` | API keys that were inline in headers. |
| `<GREEN_API_INSTANCE>`, `<GREEN_API_TOKEN>` | WhatsApp instance credentials. |
| `<GOOGLE_RESOURCE_ID_n>` | Google Sheets, Docs or Drive ids. |
| `<AIRTABLE_BASE_ID_n>`, `<AIRTABLE_TABLE_ID_n>` | Airtable resources. |
| `<NOTION_PAGE_ID_n>` | Notion databases and pages. |
| `<YOUR_TELEGRAM_CHAT_ID>`, `<YOUR_WHATSAPP_ID>` | Messaging destinations. |
| `<YOUR_GOOGLE_CALENDAR_ID>` | Calendar id. |

All `webhookId` values were regenerated. n8n assigns new ones on import in any
case.

## Verifying

`scan_secrets.js` walks every workflow JSON and reports values that look like
live credentials — key-shaped strings, suspicious parameter names, and
credentials embedded in URL paths or query strings.

```bash
cd workflows/<name> && node ../../scan_secrets.js
```

`analyze.js` summarizes a workflow's triggers, node mix, credentials, outbound
endpoints and error handling:

```bash
node analyze.js workflows/<name>/workflow.json
```

## Honest notes on quality

These are real workflows, warts included, and each README documents the specific
problems in that workflow rather than pretending they aren't there. The recurring
themes:

- **Error handling is the weakest area.** Two of the eight configure it
  meaningfully. `tadawul-disclosure-monitor` is the reference implementation —
  every failure path routes to a shared error sink and the loop continues.
- **Read-then-write races.** Several use Google Sheets or Airtable as a
  transactional store without locking, so concurrent executions can double-write.
- **Secrets were inline rather than in credentials.** Three live keys were found
  in node parameters, one hidden in a URL path where a header-name scan misses it.
  All have been replaced here.

The per-workflow **Known issues** sections go into detail, including the parts
that could not be determined from the JSON alone — those are marked *unclear*
rather than guessed at.

## License

MIT — see [LICENSE](LICENSE).
