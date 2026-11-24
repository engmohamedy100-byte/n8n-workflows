# Al-Baraka Customer Service Bot (n8n)

A Telegram customer service bot for a dairy company, built with n8n. Customers
chat in Egyptian Arabic. The bot answers company questions from a knowledge
base, takes orders, checks and deducts stock, logs complaints, and cancels
orders.

## How it works

```
PDFs in Google Drive --> Ingestion --> Supabase (vector store)
                                              |
Customer (Telegram) --> Main Agent ----------+  company questions
                           |
                           +--> Check Inventory Batch --> Google Sheets (Inventory)
                           +--> Update Inventory Batch --> Google Sheets (Inventory)
                           +--> Cancel Order Batch -----> Google Sheets (Orders, Inventory)
                           +--> Orders / Complaints (Google Sheets)
                           +--> Gmail (shortage alert to the manager)
                           +--> Telegram (message to the preparation team)
```

## Files

| File | What it does |
| --- | --- |
| `main_agent_workflow.json` | Telegram trigger, AI agent (OpenRouter, 15-message memory per chat), and all tools |
| `check_inventory_batch.json` | Sub-workflow. Matches requested items to the Inventory sheet and returns `confirmed_items`, `unavailable_items`, `unmatched_items` |
| `update_inventory_batch.json` | Sub-workflow. Re-reads live stock, deducts confirmed items, returns `updated_items` and `failed_items` |
| `cancel_order_batch.json` | Sub-workflow. Cancels an order and returns its items to stock |
| `ingestion_workflow.json` | Watches a Drive folder, reads new PDFs, splits them, embeds them with Ollama, stores them in Supabase |
| `supabase_setup.sql` | Creates the `documents` table and the `match_documents` function |

## Google Sheet

One spreadsheet with three tabs.

| Tab | Columns |
| --- | --- |
| `Inventory` | `item_name`, `quantity_available` |
| `Orders` | `order_id`, `customer_chat_id`, `customer_name`, `items`, `status`, `order_date` |
| `Complaints` | `complaint_id`, `customer_chat_id`, `customer_name`, `item_name`, `description`, `status`, `complaint_date` |

Order statuses are `قيد التحضير` (in preparation) and `ملغي` (cancelled). New
complaints get `قيد المراجعة` (under review). The `items` column is written as
`item name × quantity, item name × quantity`. The cancel flow reads this
format, so do not change it by hand.

## Order flow

1. The customer lists items and confirms the full order once.
2. The agent generates an order ID.
3. Check Inventory matches names (ignores diacritics and common spelling
   variants). If a name is unclear, the bot asks the customer to clarify.
4. Update Inventory deducts the available items using the live stock level.
5. The order is saved in `Orders`, the manager gets an email about missing
   items, and the preparation team gets a Telegram message.
6. The customer receives the order ID and a summary.

## Cancel flow

The customer gives the order ID and confirms. An order can be cancelled only
while its status is `قيد التحضير`. The status becomes `ملغي`, the quantities
return to `Inventory`, and the preparation team is notified.

## Requirements

- n8n (self-hosted or cloud)
- Telegram bot token
- OpenRouter API key
- Ollama running and reachable from n8n, with the `nomic-embed-text` model
- Supabase project
- Google account with Drive, Sheets and Gmail access

## Setup

1. Run `supabase_setup.sql` in the Supabase SQL editor.
2. Create the Google Sheet with the three tabs above.
3. Import the three sub-workflows (`check_inventory_batch`,
   `update_inventory_batch`, `cancel_order_batch`).
4. Import `main_agent_workflow.json` and set the workflow ID in each of its
   three workflow tool nodes.
5. Replace every placeholder starting with `PUT_`: spreadsheet ID, Drive
   folder ID, manager email, preparation team chat ID, and the credential
   references.
6. Import `ingestion_workflow.json` and upload a small PDF to the Drive folder
   to test it.
7. Activate the main workflow and send a test message to the bot.

## Known limitations

- Google Sheets has no locking. Two orders arriving at the same moment can
  still collide. For heavy traffic, keep the inventory in a database.
- Item names are matched flexibly, but the bot still depends on the names in
  the `Inventory` sheet being clear and unique.
- Test everything on a copy of the sheet before using real data.
