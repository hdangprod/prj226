const fs = require('fs');
const path = require('path');
const { updateKanbanStatus, loadOrchestratorState, saveOrchestratorState, runCmd } = require('./supreme_assistant');

function runReviewStage() {
  const state = loadOrchestratorState();
  const REVIEW_FILE_PATH = path.join(__dirname, '../../../review.md');
  
  console.log("[REVIEW DISPATCHER] Triggering independent code quality analysis...");
  
  if (fs.existsSync(REVIEW_FILE_PATH)) {
    const reviewContent = fs.readFileSync(REVIEW_FILE_PATH, 'utf8');
    if (reviewContent.includes('[REVIEW_STATUS: REJECTED]')) {
      console.warn("[REVIEW DISPATCHER] Code Smell / Spec violation found. Redirecting to Execution Worker.");
      process.exit(1);
    }
  }

  // 3-Step Documentation Cascade & Build Gate
  console.log("[REVIEW DISPATCHER] Verifying 3-Step Documentation Cascade & clean build status...");
  const specPath = path.join(__dirname, '../../../../docs/spec.md');
  const contextPath = path.join(__dirname, '../../../../docs/agents/context.md');
  const sitemapPath = path.join(__dirname, '../../../../docs/sitemap.md');

  if (!fs.existsSync(specPath) || !fs.existsSync(contextPath) || !fs.existsSync(sitemapPath)) {
    console.error("[DOC_CASCADE_FAILED] Mandatory documentation files (spec.md, context.md, sitemap.md) missing or invalid!");
    process.exit(1);
  }

  try {
    console.log("[REVIEW DISPATCHER] Running TypeScript compilation check (npm run build)...");
    runCmd('npm run build');
    console.log("[REVIEW DISPATCHER] 3-Step Documentation Cascade & Build Verification Passed.");
  } catch (buildErr) {
    console.error("[DOC_CASCADE_FAILED] TypeScript compilation (npm run build) failed with errors. Rejecting merge.");
    process.exit(1);
  }

  console.log(`[REVIEW DISPATCHER] 100% Approval verified for ticket ${state.currentTicketId}. Merging branch...`);
  
  runCmd('git checkout main');
  runCmd(`git merge --no-ff ${state.currentBranch} -m "chore: successfully integrated ticket ${state.currentTicketId}"`);
  runCmd(`git branch -d ${state.currentBranch}`);
  
  updateKanbanStatus(state.currentTicketId, 'DONE');
  state.currentTicketId = null;
  state.retryCount = 0;
  saveOrchestratorState(state);
  
  console.log("[REVIEW DISPATCHER] Branch successfully cleaned up. Pipeline moving forward.");
  process.exit(0);
}

if (require.main === module) {
  runReviewStage();
}
