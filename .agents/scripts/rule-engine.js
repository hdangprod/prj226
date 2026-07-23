#!/usr/bin/env node

/**
 * rule-engine.js — Dynamic Rule Loading Engine (v1)
 *
 * Evaluates inputs against .agents/rules-manifest.json and outputs
 * matching rule Markdown content to stdout.
 *
 * Usage:
 *   node .agents/scripts/rule-engine.js --path <file_path>
 *   node .agents/scripts/rule-engine.js --keyword <keyword>
 *   node .agents/scripts/rule-engine.js --path <path> --keyword <keyword>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'rules-manifest.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into a map.
 * Supports: --path <value>, --keyword <value>
 */
function parseArgs(argv) {
  const args = { paths: [], keywords: [] };
  let i = 2; // skip node + script path
  while (i < argv.length) {
    const flag = argv[i];
    if (flag === '--path' && argv[i + 1]) {
      args.paths.push(argv[++i]);
    } else if (flag === '--keyword' && argv[i + 1]) {
      args.keywords.push(argv[++i]);
    } else if (flag === '--help' || flag === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${flag}`);
      printUsage();
      process.exit(1);
    }
    i++;
  }
  return args;
}

function printUsage() {
  console.log(`
Usage: node rule-engine.js [OPTIONS]

Options:
  --path <file_path>     Match rules by file path glob
  --keyword <keyword>    Match rules by context keyword
  --help, -h             Show this help message

Examples:
  node rule-engine.js --path src/tools/notionClient.ts
  node rule-engine.js --keyword telegram
  node rule-engine.js --path src/tools/redis/client.ts --keyword soft_lock
`);
}

/**
 * Load and parse the rules manifest.
 */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`ERROR: Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: Failed to parse manifest — ${err.message}`);
    process.exit(1);
  }
}

/**
 * Check if a given file path matches any glob pattern in match_paths.
 */
function matchesPath(rule, inputPaths) {
  if (!rule.match_paths || rule.match_paths.length === 0) return false;
  return inputPaths.some(inputPath => {
    // Normalize: strip leading ./ or / to get a relative path
    const normalized = inputPath.replace(/^\.\//, '').replace(/^\//, '');
    return rule.match_paths.some(glob =>
      minimatch(normalized, glob, { dot: true })
    );
  });
}

/**
 * Check if any input keyword matches the rule's match_keywords (case-insensitive).
 */
function matchesKeyword(rule, inputKeywords) {
  if (!rule.match_keywords || rule.match_keywords.length === 0) return false;
  const lowerRuleKw = rule.match_keywords.map(k => k.toLowerCase());
  return inputKeywords.some(kw => lowerRuleKw.includes(kw.toLowerCase()));
}

/**
 * Read a rule's Markdown file content.
 */
function readRuleFile(rule) {
  const filePath = path.join(PROJECT_ROOT, rule.file);
  if (!fs.existsSync(filePath)) {
    console.error(`WARNING: Rule file not found: ${rule.file} (rule: ${rule.id})`);
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Format the match reason tag for a rule.
 */
function matchReason(rule, matchedBy) {
  if (rule.always_on) return 'always_on';
  return `matched: ${matchedBy}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  // Require at least one input flag
  if (args.paths.length === 0 && args.keywords.length === 0) {
    console.error('ERROR: At least one --path or --keyword flag is required.');
    printUsage();
    process.exit(1);
  }

  const manifest = loadManifest();
  const rules = manifest.rules || [];

  // Collect matching rules with deduplication
  const matched = new Map(); // id -> { rule, reason }

  for (const rule of rules) {
    // Always-on rules always match
    if (rule.always_on === true) {
      matched.set(rule.id, { rule, reason: 'always_on' });
      continue;
    }

    // Path matching
    if (args.paths.length > 0 && matchesPath(rule, args.paths)) {
      matched.set(rule.id, { rule, reason: 'path' });
      continue;
    }

    // Keyword matching
    if (args.keywords.length > 0 && matchesKeyword(rule, args.keywords)) {
      matched.set(rule.id, { rule, reason: 'keyword' });
    }
  }

  // If no rules matched (aside from always_on), emit what we have
  if (matched.size === 0) {
    console.log('No matching rules found.');
    process.exit(0);
  }

  // Output concatenated Markdown
  const entries = Array.from(matched.values());
  const output = entries
    .map(({ rule, reason }) => {
      const content = readRuleFile(rule);
      if (!content) return null;
      const header = `--- RULE: ${rule.id} [${reason}] ---`;
      return `${header}\n\n${content.trim()}`;
    })
    .filter(Boolean)
    .join('\n\n');

  console.log(output);
}

main();
