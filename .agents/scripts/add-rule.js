#!/usr/bin/env node

/**
 * add-rule.js — Strict Rule Creation SOP Enforcer
 *
 * Creates new rule files and registers them in rules-manifest.json atomically.
 * Also supports --verify for manifest/filesystem integrity auditing.
 *
 * Usage:
 *   node .agents/scripts/add-rule.js --id <id> --keywords <k1,k2> --paths <p1,p2> [--always-on]
 *   node .agents/scripts/add-rule.js --verify
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'rules-manifest.json');
const RULES_DIR = path.join(PROJECT_ROOT, '.agents', 'rules');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    id: null,
    keywords: [],
    paths: [],
    alwaysOn: false,
    verify: false,
    description: null,
  };
  let i = 2;
  while (i < argv.length) {
    const flag = argv[i];
    switch (flag) {
      case '--id':
        args.id = argv[++i];
        break;
      case '--keywords':
        args.keywords = (argv[++i] || '').split(',').map(k => k.trim()).filter(Boolean);
        break;
      case '--paths':
        args.paths = (argv[++i] || '').split(',').map(p => p.trim()).filter(Boolean);
        break;
      case '--always-on':
        args.alwaysOn = true;
        break;
      case '--verify':
        args.verify = true;
        break;
      case '--description':
        args.description = argv[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
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
Usage:
  node add-rule.js --id <rule-id> --keywords <k1,k2> [--paths <p1,p2>] [--always-on] [--description <desc>]
  node add-rule.js --verify

Options:
  --id <rule-id>            Unique rule identifier (required for creation)
  --keywords <k1,k2,...>    Comma-separated match keywords
  --paths <p1,p2,...>       Comma-separated glob patterns for path matching
  --always-on               Mark rule as always-on (global governance)
  --description <desc>      Human-readable description of the rule
  --verify                  Audit manifest/filesystem sync integrity
  --help, -h                Show this help message

Examples:
  node add-rule.js --id redis-state --keywords redis,soft_lock,hard_lock --paths "src/tools/redis/**,src/governance/**"
  node add-rule.js --id security-policy --keywords security --always-on
  node add-rule.js --verify
`);
}

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

function saveManifest(manifest) {
  try {
    const json = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(MANIFEST_PATH, json, 'utf-8');
  } catch (err) {
    console.error(`ERROR: Failed to write manifest — ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Rule Creation
// ---------------------------------------------------------------------------

function createRule(args) {
  if (!args.id) {
    console.error('ERROR: --id is required for rule creation.');
    printUsage();
    process.exit(1);
  }

  if (args.keywords.length === 0) {
    console.error('ERROR: --keywords is required (at least one keyword).');
    process.exit(1);
  }

  // Validate ID format (lowercase, hyphens, no spaces)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.id)) {
    console.error('ERROR: Rule ID must be lowercase alphanumeric with hyphens (e.g., "redis-state").');
    process.exit(1);
  }

  const manifest = loadManifest();

  // Check for duplicate IDs
  const existing = manifest.rules.find(r => r.id === args.id);
  if (existing) {
    console.error(`ERROR: Rule with id "${args.id}" already exists in manifest.`);
    process.exit(1);
  }

  // Create rule file
  const fileName = `${args.id}-rules.md`;
  const relativeFilePath = `.agents/rules/${fileName}`;
  const absoluteFilePath = path.join(RULES_DIR, fileName);

  if (fs.existsSync(absoluteFilePath)) {
    console.error(`ERROR: File already exists at ${relativeFilePath}. Aborting to prevent overwrite.`);
    process.exit(1);
  }

  const description = args.description || `Rules for ${args.id.replace(/-/g, ' ')}`;
  const boilerplate = `# ${toTitleCase(args.id)} Rules

## Rule Statement
<!-- Define the core constraint or policy this rule enforces -->
TODO: Document the rule statement for ${args.id}.

## Implementation Guidelines
<!-- Provide specific, actionable guidelines -->
1. TODO: Add guideline 1.
2. TODO: Add guideline 2.
`;

  // Write the rule file
  fs.writeFileSync(absoluteFilePath, boilerplate, 'utf-8');

  // Add entry to manifest
  const entry = {
    id: args.id,
    description,
    file: relativeFilePath,
    always_on: args.alwaysOn,
    match_keywords: args.keywords,
    match_paths: args.paths,
  };

  manifest.rules.push(entry);
  saveManifest(manifest);

  // Validate the saved manifest parses cleanly
  try {
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (err) {
    console.error(`CRITICAL: Manifest corrupted after write — ${err.message}`);
    process.exit(1);
  }

  console.log(`✅ Rule created successfully:`);
  console.log(`   File:     ${relativeFilePath}`);
  console.log(`   ID:       ${args.id}`);
  console.log(`   Keywords: [${args.keywords.join(', ')}]`);
  console.log(`   Paths:    [${args.paths.join(', ')}]`);
  console.log(`   Always On: ${args.alwaysOn}`);
  console.log(`   Manifest: Updated (${manifest.rules.length} total rules)`);
}

function toTitleCase(str) {
  return str
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyIntegrity() {
  const manifest = loadManifest();
  let hasErrors = false;

  console.log('🔍 Auditing manifest/filesystem integrity...\n');

  // Check 1: All manifest entries have existing files
  const manifestFiles = new Set();
  for (const rule of manifest.rules) {
    const absolutePath = path.join(PROJECT_ROOT, rule.file);
    manifestFiles.add(path.resolve(absolutePath));

    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ MISSING FILE: Manifest references "${rule.file}" (rule: ${rule.id}) but file does not exist.`);
      hasErrors = true;
    } else {
      console.log(`✅ ${rule.id}: ${rule.file} — exists`);
    }
  }

  // Check 2: All .md files in rules/ are indexed in manifest
  const rulesFiles = fs.readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.resolve(path.join(RULES_DIR, f)));

  for (const filePath of rulesFiles) {
    if (!manifestFiles.has(filePath)) {
      const relativePath = path.relative(PROJECT_ROOT, filePath);
      console.error(`⚠️  ORPHAN FILE: "${relativePath}" exists but is NOT indexed in rules-manifest.json.`);
      hasErrors = true;
    }
  }

  // Check 3: No duplicate IDs
  const ids = manifest.rules.map(r => r.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    console.error(`❌ DUPLICATE IDs: ${duplicates.join(', ')}`);
    hasErrors = true;
  }

  console.log('');
  if (hasErrors) {
    console.error('❌ Integrity check FAILED. See errors above.');
    process.exit(1);
  } else {
    console.log(`✅ All ${manifest.rules.length} rules are correctly indexed. No orphans, no missing files.`);
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  if (args.verify) {
    verifyIntegrity();
  } else {
    createRule(args);
  }
}

main();
