/**
 * PRJ226 v4.2: Session-Based Telegram Bot Workflow — Shared Types
 *
 * Dependency-free type contracts shared by the pure policy modules, the
 * TelegramSession Durable Object, and the skills/tool layer.
 */

export interface ConversationScope {
  scopeId: string;
  chatId: number;
  threadId: number;
  userId?: number;
  mode: 'private' | 'user_scoped' | 'shared';
}

export interface SessionCoordinate {
  sessionId: string;
  generation: number;
}

export interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type SkillFormat = 'plain' | 'safe_html';

export interface SkillButton {
  label: string;
  callbackToken?: string;
  url?: string;
}

export interface PlannedSideEffect {
  actionKey: string;
  actionType: string;
  targetId?: string;
}

export interface SourceRef {
  id: string;
  path?: string;
  title?: string;
}

/**
 * Structured return contract for skills (spec §12.5).
 * Session mode skills MUST NOT call Telegram directly; they return this
 * and the session coordinator owns persistence and delivery.
 */
export interface SkillResult {
  text: string;
  format: SkillFormat;
  buttons?: SkillButton[][];
  sourceRefs?: SourceRef[];
  sideEffects?: PlannedSideEffect[];
  sessionPatch?: {
    currentFocus?: unknown;
    pinnedFacts?: unknown[];
  };
}

export type LifecycleCommand =
  | 'start'
  | 'end'
  | 'new'
  | 'status'
  | 'summary'
  | 'retry'
  | 'cancel'
  | 'forget_session';

export type ParsedCommand =
  | { kind: 'command'; command: LifecycleCommand; arg?: string }
  | { kind: 'not_command' };

export type TurnIntent =
  | 'Daily_Focus'
  | 'Task_Capture'
  | 'Reschedule'
  | 'Knowledge_Search'
  | 'General_Assistant'
  | 'Rescue_Mode'
  | 'Workday_Handoff'
  | 'Inbox_Organize';

export interface TurnPlan {
  intent: TurnIntent;
  confidence: number;
  standaloneQuery?: string;
  entities: Array<{
    type: string;
    value: string;
    source: 'current_turn' | 'recent_context' | 'summary';
  }>;
  explicitActionEvidence?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

export interface RollingSessionSummary {
  primaryTopics: string[];
  userGoals: string[];
  establishedFacts: Array<{
    fact: string;
    confidence: 'user_stated' | 'source_supported' | 'assistant_inference';
  }>;
  decisions: string[];
  unresolvedQuestions: string[];
  referencedSources: SourceRef[];
  currentEntities: Array<{ type: string; value: string }>;
  currentFocus?: string;
  excludedTopics?: string[];
  coversThroughSeq: number;
}
