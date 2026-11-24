# Gamma Proposal Generation

An n8n workflow that turns a recorded sales or discovery call into a client-ready proposal deck.

Fireflies transcript → Slack approval → AI agent writes the proposal → Gamma builds the deck → status saved in Google Sheets.

## Credit and disclaimer

This is a **modified version** of the original workflow template by **Nate Herk** ([YouTube](https://www.youtube.com/@nateherk)).

- I am **not** the author of the original workflow, and this repo is not affiliated with or endorsed by him.
- The core idea and the base structure come from his template. My additions and fixes are listed below.
- Before reusing or redistributing, check the license of the original template. If you are the original author and want this removed or changed, please open an issue.

## How it works

1. **Log Meeting.** A Fireflies webhook starts the flow. The workflow waits, fetches the meeting, and saves it in a Google Sheet (title, attendees, summary, status).
2. **Approval.** A new row in the sheet triggers a Slack message: "Would you like a proposal generated?" (Yes / No).
3. **Generate.** On "Yes", the transcript is cleaned up (speaker by speaker) and sent to an AI agent through OpenRouter. The agent writes a full proposal in a fixed structure.
4. **Deck.** The proposal is sent to the Gamma API, which creates a presentation and exports a PDF.
5. **Notify and track.** Slack confirms the deck is being created, and the sheet status changes to `Generated` or `Generation Declined`.

## What is new in this version

Changes and fixes relative to the original template:

- **Infinite loop protection.** New `Retry Guard` node stops the "wait and retry" loop after 10 checks instead of running forever.
- **Retry loop bug.** The retry loop read the meeting ID from the previous node's output, which does not exist on a retry. It now reads it from the Webhook node.
- **Wait unit is explicit** (1 minute) instead of relying on the node default.
- **Gamma request body.** The proposal text is now encoded with `JSON.stringify`. Before, line breaks were flattened and quotes were replaced, which hurt the deck structure.
- **Status update.** `Generated` uses append-or-update, so manual runs for meetings that were never logged are recorded too.
- **Removed the previous owner's data:** personal email in the Gamma sharing options, Slack channel and Google Sheet IDs, Gamma theme ID, credential references, and instance metadata.
- **Cleared the agent system prompt.** The original prompt was written for another person's company (name, claims and value proposition). It is now empty, so this repo contains no company-specific text. You write your own.

## Setup

1. Import `workflow.json` into n8n.
2. Create your own credentials and attach them to the nodes: Fireflies, Slack, Google Sheets (4 nodes), OpenRouter, and an HTTP Header Auth credential for Gamma (use the header name from Gamma's API docs).
3. Make a copy of the meeting log sheet (the original setup guide inside the workflow links to a template). Put your own sheet ID in the 4 Google Sheets nodes. The columns are: `Date / Time`, `Title`, `Attendees`, `Gist`, `Status`, `ID`.
4. Put your Slack channel ID in `Proposal Generation?` and `Notification`.
5. In `Gamma Deck`, set the recipient email in `sharingOptions`. Optionally add your own `themeId`.
6. In `Proposal Generator Agent`, write your own system prompt (role, proposal structure, tone, and your company's real value proposition). It is empty on purpose. Do not activate the workflow before this step.
7. In Fireflies, set the webhook URL to the n8n Webhook node (production URL), then activate the workflow.

## Security notes

- Never commit API keys. This export contains no credentials, keep it that way.
- The webhook has no authentication. Add header auth or a secret check before using it in production.
- Proposals can contain client data. Check who receives the Gamma deck (`sharingOptions`) before activating.

## Known issues

- The AI model name in the OpenRouter node is a preview model. Change it if it is retired.
- Gamma generation is asynchronous. The Slack message says the deck is "being generated"; it does not wait for the final link.
- The Fireflies nodes need the Fireflies community node installed in n8n.
- Import and test in a safe n8n instance first. The fixes above were checked on the workflow structure (nodes and connections), not through a live run.
