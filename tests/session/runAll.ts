/**
 * Session-based workflow test runner.
 * Run with: npm run test:session
 */

import { Harness, type SuiteFn } from './harness';
import conversationScopeSuite from './conversationScope.test';
import commandParserSuite from './commandParser.test';
import timeoutPolicySuite from './timeoutPolicy.test';
import securitySuite from './security.test';
import textChunkerSuite from './textChunker.test';
import tokenBudgetSuite from './tokenBudget.test';
import stateMachineSuite from './stateMachine.test';
import concurrencySuite from './concurrency.test';
import schemaSuite from './schema.test';
import ingressSuite from './ingress.test';

const suites: Array<[string, SuiteFn]> = [
  ['conversationScope', conversationScopeSuite],
  ['commandParser', commandParserSuite],
  ['timeoutPolicy', timeoutPolicySuite],
  ['security', securitySuite],
  ['textChunker', textChunkerSuite],
  ['tokenBudget', tokenBudgetSuite],
  ['stateMachine', stateMachineSuite],
  ['concurrency', concurrencySuite],
  ['schema', schemaSuite],
  ['ingress', ingressSuite],
];

async function main(): Promise<void> {
  console.log('=== PRJ226 Session Workflow Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of suites) {
    const h = new Harness();
    try {
      await fn(h);
    } catch (err) {
      h.assert(false, `suite threw: ${String(err)}`);
    }
    h.summary(name);
    passed += h.passed;
    failed += h.failed;
  }

  console.log(`\n=== Session Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Session test runner error:', err);
  process.exit(1);
});
