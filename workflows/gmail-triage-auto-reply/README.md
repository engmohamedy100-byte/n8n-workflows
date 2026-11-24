# Gmail Triage & Auto-Reply

Classifies incoming Gmail messages, applies a label, then drafts or sends an
AI-written reply.

- **Source file:** `AI Lead Research & Personalized Email Generator.json`
- **Internal name:** `reply on message on gmail and put in suitable lable`
- **Nodes:** 17 · **Trigger:** Gmail · **Status in export:** inactive

> **Filename mismatch.** The exported file is named "AI Lead Research &

Classifies incoming Gmail messages, applies a label, then drafts or sends an
AI-written reply.

- Source file: `AI Lead Research & Personalized Email Generator.json`
- Internal name: `reply on message on gmail and put in suitable lable`
- 17 nodes, Gmail trigger, exported inactive

A note on the filename: the export is called "AI Lead Research & Personalized
Email Generator", but the workflow inside is a Gmail classify-label-reply agent.
There is no lead-research or list-building logic in the JSON, so the folder
follows the contents, not the filename.

## What it does

On each new Gmail message, an LLM classifier sorts it into one of three
categories. The message gets the matching label and is marked read, an AI agent
composes a reply, and a condition decides whether to send it or leave a draft
for review.

## Flow

```
Gmail Trigger
  └─> Text Classifier  (Groq)
        ├─[cat 0]─> Add label to message   ─> Edit Fields  ─┐
        ├─[cat 1]─> Add label to message1  ─> Edit Fields1 ─┤
        └─[cat 2]─> Add label to message2  ─> Edit Fields1 ─┘
                                                            └─> Mark a message as read
                                                                  └─> AI Agent  (Groq + Simple Memory)
                                                                        └─> Wait
                                                                              └─> Edit Fields2
                                                                                    └─> If
                                                                                        ├─[true]──> Reply to a message
                                                                                        └─[false]─> Create a draft
```

## Nodes

| Node | Type | Notes |
|---|---|---|
| Gmail Trigger | `gmailTrigger` | Polls for new mail. Poll interval is not visible in the export. |
| Text Classifier | `textClassifier` | Three-way routing, backed by `Groq Chat Model`. |
| Add label to message ×3 | `gmail` | One per category. |
| Mark a message as read | `gmail` | Convergence point for all three branches. |
| AI Agent | `agent` | Composes the reply. Uses `Groq Chat Model1` and `Simple Memory`. |
| Simple Memory | `memoryBufferWindow` | `sessionKey: {{ $('Gmail Trigger').item.json.id }}` — see below. |
| Wait | `wait` | Delay before the send/draft decision. |
| If | `if` | Chooses reply vs. draft. |
| Reply to a message / Create a draft | `gmail` | The two outcomes. |

All three classifier branches converge on `Mark a message as read`, so the
agent sees one item per message regardless of category. The two `Edit Fields`
nodes normalize each branch's shape before that merge, and `Edit Fields2`
prepares the payload the `If` node tests.

## Setup

1. Import `workflow.json`.
2. Connect a Gmail OAuth2 credential with read, modify, and send scopes.
3. Connect a Groq API credential (used by both chat model nodes).
4. Create the three Gmail labels the label nodes reference.
5. Review the classifier categories and the agent's system prompt.
6. Set the `If` condition that decides send-vs-draft.

Credentials: Gmail OAuth2, Groq API.

## Known issues

Everything below is read from the export as-is; none of it is fixed in this
copy.

- The memory key defeats the memory. `Simple Memory` uses
  `sessionKey: {{ $('Gmail Trigger').item.json.id }}`. Gmail's `id` is unique
  per message, so every message opens an empty buffer and the memory never
  carries context. For continuity across a thread the key should be `threadId`.
  As written it is at least correctly isolated, with no cross-conversation
  bleed, but it is doing no work.
- No error handling anywhere. 0 of 17 nodes set `onError` or `retryOnFail`. A
  Groq rate-limit response (429) kills the run after the label has already been
  applied and the message already marked read, leaving it triaged but
  unanswered, with no retry and no alert.
- Not idempotent on failure. Because labelling and mark-as-read happen before
  the agent runs, a mid-run failure cannot be safely re-run: the trigger will
  not see the message again, since it is no longer unread.
- Auto-sending replies from an LLM is a real risk. The `If` node is the only
  thing between a generated draft and a sent email. Whether its condition is
  conservative enough is worth reviewing before enabling this on a live
  mailbox.
- No rate-limit protection. A burst of inbound mail fans out one Groq
  classification plus one agent call per message with no queue or throttle.
- Unclear from the export: the classifier's three categories, the `If`
  condition, and the Gmail trigger's poll interval all live inside node
  parameters. Read them in the n8n editor before relying on this workflow.
