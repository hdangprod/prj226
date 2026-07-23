---
trigger: model_decision
---

# Pre-Deploy Checklist Workflow (GCP Cloud Run)

Run this 3-step verification before deploying to GCP Cloud Run:

1. **Environment Validation (`validateEnv`)**:
   Ensure all environment variables are supplied via `--set-env-vars` or Secret Manager. Missing variables will trigger `validateEnv()` container crash on launch (PORT 8080 Timeout).

2. **TypeScript Compilation Check**:
   Run `npm run build` locally. Do NOT deploy if compilation fails or import paths break.

3. **IAM Firestore Permissions**:
   Grant **Firebase Firestore Admin** (or Cloud Datastore User) role to the default Cloud Run Service Account in GCP IAM & Admin to prevent `7 PERMISSION_DENIED` errors.
