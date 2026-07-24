# Redis State Rules

## Rule Statement
All Redis state operations in PRJ226 MUST follow atomic operation patterns and mandatory TTL policies to prevent race conditions and memory leaks in the serverless environment.

## Implementation Guidelines

### 1. Atomic Operations Only (ERR-01)
- **NEVER** use sequential `GET` → `SET` patterns for list data. Use `RPUSH` for atomic list append.
- Use Redis pipelines or multi-exec for operations that must be atomic across multiple keys.

### 2. Mandatory TTL on All Writes (ERR-03)
- Every `SET`, `RPUSH`, or write operation MUST be followed by `EXPIRE`.
- Default TTL for debounce buffer keys: 30 seconds (`DEBOUNCE_REDIS_TTL_S`).
- Default TTL for triage soft locks: 120 seconds (`REDIS_TTL_SOFT_LOCK`).
- Default TTL for triage hard locks: 600 seconds (`REDIS_TTL_HARD_LOCK`).

### 3. Key Naming Convention
- Debounce buffer: `buffer:${chatId}`, `buffer_time:${chatId}`, `is_transcribing:${chatId}`
- Triage locks: `soft_lock:${chatId}`, `hard_lock:${chatId}:${messageId}`

### 4. Fail-Open Policy (ERR-05)
- All Redis operations must be wrapped in try-catch.
- If Redis is unavailable, the system MUST fall back to direct processing (fail-open).
- Never block user messages due to infrastructure outage.
