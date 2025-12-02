/**
 * Minimal test runner for date utility tests.
 * This runner uses Node's built-in assert module and requires no external dependencies.
 * 
 * Usage: node tests/run-tests.cjs
 * 
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

const { tests } = require('./dateUtils.test.cjs');

let passed = 0;
let failed = 0;

console.log('\n=== Date Utility Tests ===\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    if (err.expected !== undefined && err.actual !== undefined) {
      console.log(`  Expected: ${JSON.stringify(err.expected)}`);
      console.log(`  Actual: ${JSON.stringify(err.actual)}`);
    }
    failed++;
  }
}

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed > 0) {
  console.log('Some tests failed!');
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
