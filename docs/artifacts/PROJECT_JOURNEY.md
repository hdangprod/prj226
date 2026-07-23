---
title: "Project Evolution & Engineering Journey"
version: 1.0.0
date: 2026-07-23
type: artifact_log
ai_policy: "human_reviewer_only"
---

# Project Evolution & Engineering Journey

> [!CAUTION]
> **AI AGENT TOKEN GUARD**: This file is intended exclusively for human reviewers and project documentation. AI agents MUST NOT auto-load or process this file during standard coding tasks unless explicitly requested by the user.

---

## 1. Project Overview & Core Vision

The system is a serverless conversational assistant built with **TypeScript (v5.3.3)** and **Node.js (v20+)**. It bridges Telegram natural language inputs (text & voice) with a **Notion Second Brain** (3-tier PARA structure) using **Firestore** as a stateless serverless buffer and **Gemini AI** for intent classification and natural language parsing.

---

## 2. Chronological Milestones

### Milestone 1: Core Infrastructure & Pipeline Setup
- **Goal**: Establish serverless deployment pipeline on GCP Cloud Run, integrate Gemini NLP, and connect Telegram webhook to Notion SDK.
- **Key Outcomes**:
  - Successfully deployed HTTP webhook server on GCP Cloud Run.
  - Connected Gemini LITE model for single-turn intent extraction and natural language task capture.
  - Implemented Callout blocks (💡 context descriptions) injected into Notion task body pages.
  - Integrated GCP Firestore Native Mode as an asynchronous session state buffer.

### Milestone 2: 4-Layer Closed-Loop Architecture & Agent Skills Refactoring
- **Goal**: Decouple monolithic handlers into a modular AI-Native 4-Layer Architecture (`sensors`, `governance`, `tools`, `skills`).
- **Key Outcomes**:
  - Created `src/sensors/` for Telegram webhook intake and Gemini-based voice note transcription (`voiceProcessor.ts`).
  - Created `src/governance/` for probabilistic intent evaluation (`intentRouter.ts`) with HITL fallback (`hitlManager.ts`) for confidence < 95%.
  - Created `src/tools/` encapsulating deterministic API clients (`notionClient`, `firestoreClient`, `googleClient`, `telegramClient`).
  - Created `src/skills/` introducing stateful workflow skills (`taskCaptureSkill`, `weeklyPlanningSkill`).
  - Implemented rate-limiting throttles (`delay(350)`) and HTML message escaping.

### Milestone 3: AIOS 5-Layer Framework & AI Sitemap Alignment
- **Goal**: Streamline project rules, eliminate context bloat, standardize all rule/workflow files into English, and create a single AI Sitemap index.
- **Key Outcomes**:
  - Consolidated Git branching and GitHub PR rules into a high-density, single file ([`github-workflow.md`](../../.agents/rules/github-workflow.md)).
  - Created [`docs/sitemap.md`](../sitemap.md) for explicit AI lazy-loading, preventing AI agents from preemptively reading entire file trees.
  - Restructured `docs/plans/` into per-issue plan and solution reports (`docs/plans/issue-[ID]/`).

---

## 3. Major Architectural Decisions & Learnings

### Decision 1: Stateless Serverless State Buffer (GCP Firestore Native Mode)
- **Problem**: Cloud Functions and Cloud Run containers are ephemeral and stateless. In-memory `Map` or RAM caches lost state between webhooks.
- **Solution**: Adopted GCP Firestore in Native Mode (`asia-southeast1`). Stores temporary HITL sessions (5-minute TTL) and weekly planning drafts (15-minute TTL).

### Decision 2: 3 rps Notion Rate-Limiting Guardrails
- **Problem**: Bulk task creation (e.g. weekly schedule sync) hit HTTP 429 Rate Limits from Notion API when using concurrent `Promise.all()`.
- **Solution**: Enforced sequential `for...of` iteration with mandatory `delay(350)` throttles across all bulk Notion write calls.

### Decision 3: Telegram Parse Mode (HTML vs Markdown)
- **Problem**: Telegram Markdown mode generated HTTP 400 Bad Request errors whenever task names contained unescaped characters (`*`, `_`, `[`).
- **Solution**: Standardized parse mode to `HTML` and created HTML escape helpers for all dynamic user strings.

---

## 4. Key References Directory

- **Master Sitemap**: [`docs/sitemap.md`](../sitemap.md)
- **Master Knowledge Index**: [`docs/index.md`](../index.md)
- **4-Layer System & DB Schema**: [`docs/agents/context.md`](../agents/context.md)
- **Technical Specification**: [`docs/spec.md`](../spec.md)
