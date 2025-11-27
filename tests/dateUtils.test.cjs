/**
 * Unit tests for the formatDateForXero date normalization utility.
 * These tests verify that various date formats are correctly normalized to YYYY-MM-DD.
 */

const { formatDateForXero } = require('../backend/utils/dateUtils');
const assert = require('assert');

// Collect test results
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// Test: Already in ISO format (YYYY-MM-DD) - should remain unchanged
test('ISO format (YYYY-MM-DD) remains unchanged', () => {
  assert.strictEqual(formatDateForXero('2025-11-20'), '2025-11-20');
});

// Test: DD/MM/YYYY format
test('DD/MM/YYYY format is normalized', () => {
  assert.strictEqual(formatDateForXero('20/11/2025'), '2025-11-20');
});

// Test: DD-MM-YYYY format
test('DD-MM-YYYY format is normalized', () => {
  assert.strictEqual(formatDateForXero('20-11-2025'), '2025-11-20');
});

// Test: DD.MM.YYYY format
test('DD.MM.YYYY format is normalized', () => {
  assert.strictEqual(formatDateForXero('20.11.2025'), '2025-11-20');
});

// Test: Two-digit year (DD/MM/YY)
test('Two-digit year (DD/MM/YY) is normalized to 20XX', () => {
  assert.strictEqual(formatDateForXero('20/11/25'), '2025-11-20');
});

// Test: Two-digit year with dashes (DD-MM-YY)
test('Two-digit year (DD-MM-YY) is normalized to 20XX', () => {
  assert.strictEqual(formatDateForXero('20-11-25'), '2025-11-20');
});

// Test: Two-digit year with dots (DD.MM.YY)
test('Two-digit year (DD.MM.YY) is normalized to 20XX', () => {
  assert.strictEqual(formatDateForXero('20.11.25'), '2025-11-20');
});

// Test: Single-digit day and month (D/M/YYYY)
test('Single-digit day and month (D/M/YYYY) are padded', () => {
  assert.strictEqual(formatDateForXero('5/3/2025'), '2025-03-05');
});

// Test: Leading/trailing whitespace is trimmed
test('Whitespace is trimmed', () => {
  assert.strictEqual(formatDateForXero('  20/11/2025  '), '2025-11-20');
});

// Test: null input returns null
test('null input returns null', () => {
  assert.strictEqual(formatDateForXero(null), null);
});

// Test: undefined input returns undefined
test('undefined input returns undefined', () => {
  assert.strictEqual(formatDateForXero(undefined), undefined);
});

// Test: Empty string returns empty string
test('Empty string returns empty string', () => {
  assert.strictEqual(formatDateForXero(''), '');
});

// Test: Unparsable input returns original string (fallback behavior)
test('Unparsable input returns original string', () => {
  assert.strictEqual(formatDateForXero('not-a-date'), 'not-a-date');
});

// Test: First day of year
test('First day of year is normalized correctly', () => {
  assert.strictEqual(formatDateForXero('01/01/2025'), '2025-01-01');
});

// Test: Last day of year
test('Last day of year is normalized correctly', () => {
  assert.strictEqual(formatDateForXero('31/12/2025'), '2025-12-31');
});

// Test: Year 2000 with two-digit year
test('Year 2000 with two-digit year (00) is normalized', () => {
  assert.strictEqual(formatDateForXero('15/06/00'), '2000-06-15');
});

// Export tests for the runner
module.exports = { tests };
