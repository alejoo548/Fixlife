# Fixlife Admin Voice Agent

This folder contains the LiveKit Agent that joins the admin assistant room and answers with voice.

## Required environment variables

```env
OPENAI_API_KEY=sk-...
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_OPENAI_MODEL=gpt-realtime
LIVEKIT_AGENT_OPENAI_VOICE=marin
LIVEKIT_AGENT_LOG_LEVEL=info
```

## Local Docker run

Keep the main app running:

```bash
docker compose up -d backend frontend
```

Then start the voice worker:

```bash
docker compose --profile voice up -d admin-assistant-agent
```

Open the admin assistant:

```text
http://localhost:3000/admin-dashboard/assistant
```

The text assistant works through the normal backend. The voice assistant requires LiveKit credentials and an OpenAI API key with Realtime access.

## Safety

The voice agent only has read-only tools. It can summarize requests, Trust & Safety, penalties, and moderation status, but it cannot approve, delete, suspend, refund, or modify records.
