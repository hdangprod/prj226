---
title: "AIOS Architecture Overview"
tags: [architecture, second-brain, openwiki, cloudflare-workers]
category: "Technical Architecture"
author: "OpenWiki Personal Brain"
synthesized_at: "2026-07-27T18:30:00Z"
---

# AIOS Architecture Overview

The AI-Native Second Brain (PRJ226) operates on a **dual-speed architecture**:

## 1. Hot Path (< 2s Latency)
- **Runtime**: Cloudflare Workers with Hono framework.
- **Trigger**: Telegram Webhooks & Notion webhooks.
- **Storage**: Neon Postgres with `pgvector` for fast real-time similarity search.

## 2. Cold Path (Nightly Batch)
- **Engine**: OpenWiki CLI (`openwiki personal --update`).
- **Trigger**: GitHub Actions cron (`0 */6 * * *`).
- **Output**: Open Knowledge Format (OKF v0.1) Markdown files stored in GitHub `./vault`.
