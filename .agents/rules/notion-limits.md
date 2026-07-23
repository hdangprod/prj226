---
trigger: model_decision
---

# Notion API Rate Limiting Rules

## Rate Limits (HTTP 429 Protection)
Notion API caps requests at 3 requests per second (rps). To prevent failures during bulk operations, strictly enforce:

1. **Mandatory Throttle Delay**:
   - Insert `delay(350)` (or >333ms) between consecutive API calls in loops.

2. **No Unbounded Parallel Requests**:
   - Do NOT use `Promise.all()` for array operations on Notion API when array length can exceed 3. Use `for...of` sequential loops with delays instead.
