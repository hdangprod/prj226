const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { updateKanbanStatus, loadOrchestratorState, saveOrchestratorState } = require('./supreme_assistant');

const MAX_RETRIES = 3;
const DEBUG_LOG_PATH = path.join(__dirname, '../resources/execution_debug_box.json');

function cleanStackTrace(rawErrorLog) {
  const lines = rawErrorLog.split('\n');
  const relevantLines = lines.filter(line => 
    line.includes('Error:') || 
    line.includes('at ') || 
    line.includes('ts-node') ||
    line.includes('src/')
  );
  return relevantLines.slice(0, 30).join('\n');
}

function handleContextRefresh(ticketId, cleanTrace, currentRetry) {
  console.log(`[SELF-HEALING] Commencing Context Refresh Protocol for Ticket ${ticketId} (Attempt ${currentRetry}/${MAX_RETRIES}).`);
  
  const debugPayload = {
    ticketId: ticketId,
    timestamp: new Date().toISOString(),
    systemAlert: "CONTEXT_REFRESH_REQUIRED",
    retryAttempt: currentRetry,
    stackTraceBuffer: cleanTrace,
    instructions: "Wipe all chat token history. Load source files afresh and resolve the runtime crash highlighted below."
  };
  
  fs.writeFileSync(DEBUG_LOG_PATH, JSON.stringify(debugPayload, null, 2), 'utf8');
  console.log(`[SELF-HEALING] Debug state isolated inside ${DEBUG_LOG_PATH}. Worker context reset complete.`);
}

function runTests() {
  const state = loadOrchestratorState();
  if (!state.currentTicketId) {
    console.log("[TEST RUNNER] No active ticket registered in system memory.");
    process.exit(0);
  }

  try {
    console.log("[TEST RUNNER] Launching Local Test Harness integration suite...");
    execSync('npm test', { env: { ...process.env, NODE_ENV: 'test', QUEUE_MODE: 'sync' }, encoding: 'utf8' });
    console.log("[TEST RUNNER] Integration Checkpoint Passed Successfully.");
    process.exit(0);
  } catch (executionException) {
    const rawOutput = executionException.stdout + '\n' + executionException.stderr;
    console.warn("[TEST RUNNER] System Failure Detected in execution runtime codebase.");
    
    const compactTrace = cleanStackTrace(rawOutput);
    state.retryCount += 1;
    
    if (state.retryCount > MAX_RETRIES) {
      console.error("[ESCALATION GATE TRIGGERED] Ticket exceeded max failure limit. Halting flow to prevent infinity loop.");
      updateKanbanStatus(state.currentTicketId, 'BLOCKED');
      
      console.log(`\n=======================================================\n`);
      console.log(`[HITL ALERT] ESCALATION GATE REACHED ON TICKET: ${state.currentTicketId}`);
      console.log(`SPECIFICATION BREAK DETECTED. Stack trace output:\n`);
      console.log(compactTrace);
      console.log(`\n=======================================================\n`);
      
      state.currentTicketId = null;
      state.retryCount = 0;
      saveOrchestratorState(state);
      process.exit(1); 
    } else {
      saveOrchestratorState(state);
      handleContextRefresh(state.currentTicketId, compactTrace, state.retryCount);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  runTests();
}
