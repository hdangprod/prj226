/**
 * Shared test harness for the tests/session suites. Mirrors the repo's
 * hand-rolled assert pattern (tests/localTest.ts) with per-suite reporting.
 */

export class Harness {
  passed = 0;
  failed = 0;
  private failures: string[] = [];

  assert(condition: boolean, testName: string): void {
    if (condition) {
      this.passed++;
    } else {
      this.failed++;
      this.failures.push(testName);
      console.error(`❌ Failed: ${testName}`);
    }
  }

  summary(suiteName: string): void {
    if (this.failed === 0) {
      console.log(`  ✅ ${suiteName}: ${this.passed} passed`);
    } else {
      console.error(`  ❌ ${suiteName}: ${this.passed} passed, ${this.failed} failed`);
      for (const f of this.failures) {
        console.error(`     - ${f}`);
      }
    }
  }
}

export type SuiteFn = (h: Harness) => void | Promise<void>;
