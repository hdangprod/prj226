const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KANBAN_PATH = path.join(__dirname, '../resources/agent_kanban.md');
const STATE_STORE_PATH = path.join(__dirname, '../resources/orchestrator_state.json');

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

function orchestrate() {
  console.log("[SUPREME AGENT] Commencing Orchestrator Tick...");
  const state = loadOrchestratorState();
  const { tickets } = parseKanban();

  let activeTicket = tickets.find(t => t.id === state.currentTicketId);
  
  if (!activeTicket) {
    activeTicket = tickets.find(t => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    if (!activeTicket) {
      console.log("[SUPREME AGENT] Success! All Epic Tickets are completed. System is stable.");
      return;
    }
    state.currentTicketId = activeTicket.id;
    state.retryCount = 0;
    saveOrchestratorState(state);
  }

  console.log(`[SUPREME AGENT] Processing Ticket: ${activeTicket.id} - ${activeTicket.title}`);

  const branchName = `feature/ticket-${activeTicket.id}`;
  const currentGitBranch = runCmd('git rev-parse --abbrev-ref HEAD');
  
  if (currentGitBranch !== branchName) {
    console.log(`[SUPREME AGENT] Isolation Protocol: Creating branch ${branchName}`);
    runCmd(`git checkout -b ${branchName} 2>/dev/null || git checkout ${branchName}`);
    state.currentBranch = branchName;
    saveOrchestratorState(state);
    updateKanbanStatus(activeTicket.id, 'IN_PROGRESS');
  }

  try {
    console.log(`[SUPREME AGENT] Invoking self-healing loop for ticket code execution...`);
    runCmd('node .agents/skills/orchestrator/scripts/test_runner.js');
    console.log(`[SUPREME AGENT] Pass Checkpoint 1 (npm test). Route execution payload to Checkpoint 2 Reviewer.`);
    runCmd('node .agents/skills/orchestrator/scripts/review_dispatcher.js'); 
  } catch (loopError) {
    console.log(`[SUPREME AGENT] Execution halted or escalated. Check log states.`);
  }
}

if (require.main === module) {
  orchestrate();
}

module.exports = { updateKanbanStatus, loadOrchestratorState, saveOrchestratorState, runCmd };
