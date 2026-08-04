const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KANBAN_PATH = path.join(__dirname, '../resources/agent_kanban.md');
const STATE_STORE_PATH = path.join(__dirname, '../resources/orchestrator_state.json');

// PRJ226 current project layout: .agents/skills/orchestrator/scripts -> repo root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RULE_ENGINE = path.join(PROJECT_ROOT, '.agents', 'scripts', 'rule-engine.js');
const TEST_RUNNER = path.join(__dirname, 'test_runner.js');
const REVIEW_DISPATCHER = path.join(__dirname, 'review_dispatcher.js');

// Maps kanban Layer values to the current Cloudflare src/ file layout so the
// Dynamic Rule Engine (rule-engine.js --path) resolves file-level domain rules.
const LAYER_CONFIG = {
  'tools':      { paths: ['src/tools/**'],                              keywords: ['telegram'] },
  'sensors':    { paths: ['src/sensors/**'],                            keywords: ['telegram'] },
  'governance': { paths: ['src/governance/**'],                         keywords: [] },
  'skills':     { paths: ['src/skills/**'],                             keywords: ['messages', 'bot_reply'] },
  'router':     { paths: ['src/router/**'],                             keywords: ['database'] },
  'lib':        { paths: ['src/lib/**'],                                keywords: ['database'] },
  'indexers':   { paths: ['src/indexers/**'],                           keywords: ['database'] },
  'constants':  { paths: ['src/constants/**'],                          keywords: ['messages', 'bot_reply'] },
  'config':     { paths: ['src/config.ts'],                             keywords: ['database'] },
  'types':      { paths: ['src/types/**'],                              keywords: [] },
  'tests':      { paths: ['tests/**'],                                  keywords: [] },
  'migrations': { paths: ['migrations/**'],                             keywords: ['migration'] },
};

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function loadOrchestratorState() {
  if (!fs.existsSync(STATE_STORE_PATH)) {
    return { currentTicketId: null, retryCount: 0, currentBranch: 'main' };
  }
  return JSON.parse(fs.readFileSync(STATE_STORE_PATH, 'utf8'));
}

function saveOrchestratorState(state) {
  ensureDirectoryExistence(STATE_STORE_PATH);
  fs.writeFileSync(STATE_STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function parseKanban() {
  if (!fs.existsSync(KANBAN_PATH)) {
    throw new Error(`Kanban board not found at ${KANBAN_PATH}. Please run GRILL ME agent first.`);
  }
  const content = fs.readFileSync(KANBAN_PATH, 'utf8');
  const lines = content.split('\n');
  const tickets = [];

  for (let line of lines) {
    if (line.trim().startsWith('|') && !line.includes('ID') && !line.includes('---')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 5) {
        tickets.push({
          id: parts[1],
          title: parts[2],
          layer: parts[3],
          status: parts[4]
        });
      }
    }
  }
  return { content, tickets };
}

function updateKanbanStatus(ticketId, newStatus) {
  const { content } = parseKanban();
  const lines = content.split('\n');
  const updatedLines = lines.map(line => {
    if (line.trim().startsWith('|')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts[1] === ticketId) {
        parts[4] = newStatus;
        return parts.join(' | ').trim();
      }
    }
    return line;
  });
  fs.writeFileSync(KANBAN_PATH, updatedLines.join('\n'), 'utf8');
  console.log(`[SUPREME AGENT] Ticket ${ticketId} status updated to [${newStatus}] in local Kanban board.`);
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`[EXECUTION ERROR RUNNING COMMAND]: ${cmd}\n`, error.stderr || error.message);
    throw error;
  }
}

// Silent variant for best-effort cleanup (e.g. removing a stale branch that may
// not exist). Avoids the noisy "[EXECUTION ERROR]" stderr on a missing branch.
function tryRunCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

function getCurrentBranch() {
  return runCmd('git rev-parse --abbrev-ref HEAD').trim();
}

// Recursively collect repo files (skipping node_modules/.git) as POSIX-relative
// paths, so `--path` flags below are always concrete file paths — never shell
// globs. This eliminates the "Unknown flag: --path src/tools/**" failure that
// occurred when a glob was left unexpanded by the shell.
function walkFiles(dir, cb, base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(full, cb, rel);
    } else {
      cb(rel);
    }
  }
}

function expandGlobPatterns(patterns, root) {
  const matched = new Set();
  const regexList = patterns.map((pattern) => {
    const normalized = pattern.replace(/\\/g, '/');
    const regexStr = '^' + normalized
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '__DOUBLE_STAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DOUBLE_STAR__/g, '.*') + '$';
    return new RegExp(regexStr);
  });
  walkFiles(root, (rel) => {
    if (regexList.some((re) => re.test(rel))) matched.add(rel);
  });
  return Array.from(matched);
}

// Build rule-engine CLI args aligned with the current src/ layout.
// Always yields at least one --path / --keyword flag so the engine resolves
// always-on rules (github-workflow, database-isolation) plus layer-specific ones.
// Layer globs (e.g. src/tools/**) are expanded to concrete file paths so the
// rule engine receives valid, unambiguous --path arguments.
function resolveRuleEngineArgs(layer) {
  const key = String(layer || '').toLowerCase();
  const cfg = LAYER_CONFIG[key] || { paths: [], keywords: [] };
  const args = [];
  expandGlobPatterns(cfg.paths, PROJECT_ROOT).forEach((p) => args.push('--path', p));
  (cfg.keywords.concat(key)).filter(Boolean).forEach(k => args.push('--keyword', k));
  if (args.length === 0) args.push('--keyword', 'infrastructure');
  return args;
}

// Create an isolated ticket branch FRESH from the current HEAD.
// If a stale branch with the same name exists (e.g. a previously interrupted run
// pointing at an older base tree), it is force-removed first. This guards against
// re-attaching to an out-of-date codebase — the earlier regression that pulled in
// the deprecated GCP-era working tree.
function ensureTicketBranch(branchName) {
  if (getCurrentBranch() === branchName) return;
  tryRunCmd(`git branch -D ${branchName}`);
  runCmd(`git switch -c ${branchName}`);
}

// Checkpoint 3 gate: Ground-Truth Evals must pass (>= 95%) before any merge.
// runCmd throws on non-zero exit, so a failing accuracy check halts the pipeline.
function runEvalsGate() {
  console.log("[SUPREME AGENT] Checkpoint 3: Running Ground-Truth Evals Gate (npm run evals, >= 95%)...");
  const out = runCmd('npm run evals');
  console.log(out);
  console.log("[SUPREME AGENT] Evals Gate completed. See accuracy output above.");
}

function orchestrate() {
  console.log("[SUPREME AGENT] Commencing Orchestrator Tick...");
  const state = loadOrchestratorState();
  const { tickets } = parseKanban();

  let activeTicket = tickets.find(t => t.id === state.currentTicketId);

  if (!activeTicket) {
    activeTicket = tickets.find(t => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    if (!activeTicket) {
      console.log("[SUPREME AGENT] All tickets completed. Triggering final verification gates (build + evals)...");
      try {
        runCmd('npm run build');
        runCmd('npm run evals');
        console.log("[SUPREME AGENT] Success! Build clean & Ground-Truth Evals Passed (>= 95%). System is stable.");
      } catch (gateErr) {
        console.error(`[FINAL_GATE_FAILED] Final build or evals gate failed: ${gateErr.message}`);
      }
      return;
    }
    state.currentTicketId = activeTicket.id;
    state.retryCount = 0;
    saveOrchestratorState(state);
  }

  console.log(`[SUPREME AGENT] Processing Ticket: ${activeTicket.id} - ${activeTicket.title}`);

  // Dynamic Rule Engine Injection (pre-execution gate)
  console.log(`[SUPREME AGENT] Pre-execution Gate: Resolving dynamic domain rules for layer [${activeTicket.layer}]...`);
  try {
    const ruleArgs = resolveRuleEngineArgs(activeTicket.layer);
    const rulesOutput = runCmd(`node "${RULE_ENGINE}" ${ruleArgs.join(' ')}`);
    console.log(`[SUPREME AGENT] Dynamic Rules Loaded:\n${rulesOutput.slice(0, 300)}...`);
  } catch (ruleErr) {
    console.warn(`[SUPREME AGENT] Rule engine resolution warning: ${ruleErr.message}`);
  }

  const branchName = `feature/ticket-${activeTicket.id}`;

  if (getCurrentBranch() !== branchName) {
    console.log(`[SUPREME AGENT] Isolation Protocol: Creating branch ${branchName} from current HEAD...`);
    ensureTicketBranch(branchName);
    state.currentBranch = branchName;
    saveOrchestratorState(state);
    updateKanbanStatus(activeTicket.id, 'IN_PROGRESS');
  }

  try {
    console.log(`[SUPREME AGENT] Invoking self-healing loop for ticket code execution...`);
    runCmd(`node "${TEST_RUNNER}"`);
    console.log(`[SUPREME AGENT] Pass Checkpoint 1 (npm test). Running Checkpoint 3 evals gate before merge...`);
    runEvalsGate();
    console.log(`[SUPREME AGENT] Route execution payload to Checkpoint 2 Reviewer.`);
    runCmd(`node "${REVIEW_DISPATCHER}"`);
  } catch (loopError) {
    console.log(`[SUPREME AGENT] Execution halted or escalated. Check log states.`);
  }
}

if (require.main === module) {
  orchestrate();
}

module.exports = { updateKanbanStatus, loadOrchestratorState, saveOrchestratorState, runCmd };
