# Database & Environment Isolation Specification

## 1. Environment Boundary & Strict Database Isolation

> [!CAUTION]
> **STRICT DATABASE ISOLATION POLICY — DO NOT CROSS ENVIRONMENTS**:
> - `prj226-brain` (`643ded3e-456f-41f3-94d9-b5f424ee44e3`) is reserved exclusively for **Development, Testing, and Local Integration Harness (`npm test`, `npm run evals`)**.
> - `prj226-brain-prod` (`7923f482-c7cb-44a3-a371-8aadd012cfd5`) is the **LIVE PRODUCTION DATABASE** used in real life.
> - **NEVER** run test scripts, mock seed data, drops, or automated sweeps against `prj226-brain-prod`.

---

## 2. Resource Mapping Reference

| Resource Type | Development / Test (`default`) | Production (`--env production`) |
| :--- | :--- | :--- |
| **Worker Name** | `prj226-liam-dev` | `prj226-liam-prod` |
| **D1 Database Name** | `prj226-brain-dev` | `prj226-brain-prod` |
| **D1 Database ID** | `1763f575-705f-4822-a6fe-628a7f8fa602` | `7923f482-c7cb-44a3-a371-8aadd012cfd5` |
| **Vectorize Index** | `prj226-wiki-dev` | `prj226-wiki-prod` |
| **KV Namespace ID** | `ddb9e431d19b4e33bb7282dee39b3f9f` | `430f495e8bbb4041bed2b7be90fee78f` |
| **GitHub Vault Repo** | `hdangprod/hdangprod_wiki_dev` | `hdangprod/hdangprod_wiki_prod` |

---

## 3. Command Execution Policy

- **All local tests (`npm test`), offline harnesses, and evaluation suites MUST target `prj226-brain` (or mock DBs)**.
- Deployments or migrations targeting real life MUST explicitly use `--env production` (or `prj226-brain-prod` for D1 CLI commands).
- **Rule Engine Verification**: All agents MUST verify the target database ID before executing any D1 mutation or migration command.
