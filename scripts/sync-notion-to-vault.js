#!/usr/bin/env node
/**
 * PRJ226 v3.0: Notion → OKF Vault Synthesis Script
 *
 * Queries Notion API using NOTION_TOKEN to fetch accessible pages.
 * Converts Notion blocks/pages into OKF v0.1 Markdown files stored in ./vault.
 *
 * Run: node scripts/sync-notion-to-vault.js
 * Env: NOTION_TOKEN, VAULT_DIR (default: ./vault)
 */

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const VAULT_DIR = process.env.VAULT_DIR || './vault';

if (!NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN or NOTION_API_KEY environment variable is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

async function fetchNotionPages() {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filter: { value: 'page', property: 'object' },
      page_size: 100,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion search API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.results || [];
}

async function fetchPageContent(pageId) {
  const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers,
  });

  if (!response.ok) {
    return '';
  }

  const data = await response.json();
  const textLines = [];

  if (data.results) {
    for (const block of data.results) {
      const type = block.type;
      if (block[type] && block[type].rich_text) {
        const text = block[type].rich_text.map((t) => t.plain_text).join('');
        if (text) textLines.push(text);
      }
    }
  }

  return textLines.join('\n\n');
}

async function main() {
  console.log('🧠 Starting Notion to OKF Vault synthesis...');

  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }

  const pages = await fetchNotionPages();
  let synthesizedCount = 0;

  for (const page of pages) {
    const title =
      page.properties?.Name?.title?.[0]?.plain_text ||
      page.properties?.title?.title?.[0]?.plain_text ||
      '';

    if (!title || title.includes('Database PRJ226')) continue;

    const content = await fetchPageContent(page.id);
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '-').trim();

    const okfMarkdown = `---
title: "${title}"
tags: [notion-sync, second-brain]
category: "Notion Knowledge Base"
synthesized_at: "${new Date().toISOString()}"
---

# ${title}

${content || 'No text content available.'}
`;

    const filePath = path.join(VAULT_DIR, `${safeTitle}.md`);
    fs.writeFileSync(filePath, okfMarkdown, 'utf8');
    console.log(`✅ Synthesized OKF entry: ${filePath}`);
    synthesizedCount++;
  }

  console.log(`\n🎉 Synthesis complete! ${synthesizedCount} wiki entries generated in ${VAULT_DIR}.`);
}

main().catch((err) => {
  console.error('❌ Synthesis failed:', err);
  process.exit(1);
});
