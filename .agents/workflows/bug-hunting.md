---
trigger: model_decision
---

# Bug Hunting & Issue Remediation Workflow

When processing user error descriptions, logs, or screenshots:

## 1. Ingestion & Analysis
- Parse error descriptions, stack traces, and UI screenshots.
- Match error codes or behavior with project directory structure to isolate affected components.

## 2. Root Cause Analysis
- Search codebase for failure locations (Notion, Gemini, or Firestore calls).
- Verify constraints (rate limits, missing env variables, layer boundaries).

## 3. Proposal & Issue Creation
- Create a Bug Issue containing: Symptom, Root Cause, and Proposed Solution.
- Obtain approval before modifying source code.

## 4. Remediation & Verification
- Implement fix and verify via `npm run build` and tests.
- Commit with Issue ID, notify user, and close issue.