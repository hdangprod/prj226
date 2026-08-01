# Implementation Plan: Issue #52 — OpenWiki Private Vault Setup, Troubleshooting & Native Synthesis Engine

This document outlines the architecture, setup instructions, issue resolution guide, and implementation details for orchestrating a private GitHub knowledge vault (`hdangprod/hdangprod_wiki`) using a native Node.js Obsidian-to-OKF synthesis engine.

---

## User Review Required

> [!IMPORTANT]
> **PRIVACY & ARCHITECTURE**:
> - Application source code remains public in `hdangprod/prj226`.
> - Personal Second Brain notes are stored 100% privately in `hdangprod/hdangprod_wiki`.
> - Obsidian REST API integration replaces PyPI stub package `openwiki` for deterministic, zero-dependency node synthesis.

---

## 1. System Setup Guide

### Step 1: Create Private Knowledge Vault Repository
Create a private GitHub repository: `hdangprod/hdangprod_wiki`.

### Step 2: Configure Cloudflare Worker Secrets (PRJ226 App)
Set secrets via Wrangler CLI:
```bash
npx wrangler secret put GITHUB_VAULT_REPO
# Input: hdangprod/hdangprod_wiki

npx wrangler secret put GITHUB_TOKEN
# Input: <your_github_pat_with_repo_access>
```

### Step 3: Configure GitHub Actions Secrets (`hdangprod_wiki`)
In `hdangprod/hdangprod_wiki` **Settings → Secrets and variables → Actions**, add:
1. `GITHUB_TOKEN`: Obsidian Integration Secret API Key (`ntn_...`).
2. `GOOGLE_API_KEY`: Gemini API Key (`AIzaSy...`).
3. `TELEGRAM_BOT_TOKEN`: Bot API Token from `@BotFather`.
4. `TELEGRAM_CHAT_ID`: Your numeric Telegram user ID (from `@userinfobot`).

### Step 4: Configure GitHub Actions Permissions (`hdangprod_wiki`)
In `hdangprod/hdangprod_wiki` **Settings → Actions → General → Workflow permissions**:
- Select **Read and write permissions** (enables `git push` from runner).

---

## 2. Issues Encountered & Diagnostics Guide

| Issue / Trap | How to Detect | Root Cause | Solution |
| :--- | :--- | :--- | :--- |
| **Trap 1: PyPI Stub Package** | Log trace shows `openwiki personal` outputting `"openwiki"` and exiting without creating `./vault/`. | PyPI package `openwiki==0.1.1` is a 5-line print placeholder module. | Replace `openwiki` CLI with native Node script `scripts/sync-obsidian-to-vault.js`. |
| **Trap 2: GitHub 403 Write Access Denied** | Log shows `remote: Write access to repository not granted. fatal 403`. | GitHub Actions default token permissions are set to Read-only. | Set `permissions: contents: write` in workflow YAML and enable Read/Write in repo settings. |
| **Trap 3: Obsidian Database Permission Lock** | Telegram alert reports `✅ 0 wiki entries synthesized`. | Obsidian Integration not added under **Connections** on the database page. | Click `...` → **Connections** → Add your Obsidian Integration (e.g. `Gemini Assistant`). |
| **Trap 4: Orphaned Files on Deletion** | Notes deleted in Obsidian still remain in `./vault/` on GitHub. | One-way sync without vault directory state reconciliation. | Add state reconciliation in `sync-obsidian-to-vault.js` to delete `.md` files missing from Obsidian. |

---

## 3. Proposed Component Changes

### [Component: Scripts]
#### [NEW] [sync-obsidian-to-vault.js](file:///Users/dangnguyen/Desktop/PRJ226/scripts/sync-obsidian-to-vault.js)
Native Node.js script querying Obsidian REST API, fetching block text, generating OKF Markdown entries, and reconciling deleted vault files.

### [Component: GitHub Actions Workflows]
#### [MODIFY] [openwiki-nightly.yml](file:///Users/dangnguyen/Desktop/PRJ226/.github/workflows/openwiki-nightly.yml)
Updated workflow YAML adding `permissions: contents: write` and executing `node scripts/sync-obsidian-to-vault.js`.

### [Component: Documentation & Sitemap]
#### [MODIFY] [sitemap.md](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md)
Updated directory structure and script indexes to include `scripts/sync-obsidian-to-vault.js`.

---

## 4. Verification Plan

### Automated Tests
- Run `npm test` to verify offline OKF document parser contract.
- Run `npm run build` to verify Cloudflare Worker compilation with 0 errors.

### Manual Verification
- Trigger `workflow_dispatch` in `hdangprod/hdangprod_wiki` Actions tab.
- Confirm Telegram notification: `"🧠 Nightly Knowledge Sync Complete — ✅ 1 wiki entry synthesized"`.
- Verify `vault/My Second Brain Goals 2026.md` appears in `hdangprod/hdangprod_wiki`.
