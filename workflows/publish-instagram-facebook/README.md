# Publish on Instagram & Facebook

An n8n workflow that creates and publishes social media posts from a single
chat message.

- Source file: `Publish on instagram & facebook.json`
- 17 nodes, n8n chat trigger, exported inactive

## How it works

1. You send the post topic in the n8n chat.
2. An AI agent (GPT-4o-mini) returns a JSON with an image prompt and a caption.
3. The workflow builds an AI image from the prompt (Pollinations, 1024×1024).
4. The post is published to Facebook (photo) and Instagram (photo).
5. A video branch is included as a template for publishing a video from a URL.

## Flow

```
When chat message received
  └─> AI Agent  (GPT-4o-mini: image prompt + caption as JSON)
        └─> Code to rewrite json
              └─> Create Pollinations URL
                    └─> Fetch Image
                          ├─> Facebook Graph API Publish image      (me/photos, v22.0)
                          └─> HTTP Request create media instagram photos
                                └─> HTTP Request publish media instagram photos1

Video branch (template):
  fetch video url ─> Facebook Graph Publish video   (me/videos, v22.0)
                   └─> HTTP Request create media instagram video
                         └─> HTTP Request publish media instagram video
```

The Instagram nodes talk to `graph.instagram.com` v22.0 directly and follow the
required two-step flow: create a media container, then publish it. Facebook
goes through n8n's built-in Facebook Graph API node, also on v22.0.

## Setup

1. Import `workflow.json` into n8n.
2. Connect an OpenAI API credential for the chat model node.
3. Connect a Facebook Graph API credential for your Page (used by both
   Facebook nodes).
4. In the four Instagram HTTP nodes, replace `Instagram_page_id` with your
   Instagram Business account id and fill in the `access_token=` parameter.
5. For the video branch, point `fetch video url` at a public video URL (the
   export carries the placeholder `https://yourvideourl.com/video.mp4`).
6. Test on a safe account before publishing for real.

## Credentials required

- OpenAI API
- Facebook Graph API (Page token)
- Instagram Business account id + access token (inline parameters in the HTTP
  nodes, not an n8n credential — see below)

## Known issues

As exported; none of this is fixed in this copy.

- The Instagram access token travels in the URL. The four Instagram HTTP nodes
  take `access_token=` as a query parameter, so the token sits in plain node
  parameters and in every export of this file. Move it to an n8n credential
  (Header/Query Auth) before sharing or exporting further.
- No error handling anywhere. 0 of 17 nodes set `onError` or `retryOnFail`. If
  the Pollinations fetch fails or the Graph API rejects a call, the run just
  stops; nothing retries or notifies.
- The agent's JSON is parsed by hand. `Code to rewrite json` rewrites the model
  output before use, so a malformed agent response breaks the run. A structured
  output parser on the agent would make this safe.
- The video branch is a template. It has never been wired to the chat flow; the
  photo path is the working one.
- Instagram publishing needs a Business/Creator account linked to a Facebook
  Page, plus the matching Graph API permissions. A personal Instagram account
  will not work with these endpoints.
