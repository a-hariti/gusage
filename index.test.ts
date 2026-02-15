import { describe, expect, test } from 'bun:test';
import {
  parseNotifyThresholdArg,
  parseWatchIntervalArg,
  shouldSendThresholdNotification,
  validateNotifyRuntime,
} from './index.js';

describe('parseNotifyThresholdArg', () => {
  test('returns null when notify is not provided', () => {
    expect(parseNotifyThresholdArg(undefined)).toBeNull();
  });

  test('parses valid percentages', () => {
    expect(parseNotifyThresholdArg('20')).toBe(0.2);
    expect(parseNotifyThresholdArg('0')).toBe(0);
    expect(parseNotifyThresholdArg('100')).toBe(1);
    expect(parseNotifyThresholdArg('12.5')).toBe(0.125);
  });

  test('throws for invalid percentages', () => {
    expect(() => parseNotifyThresholdArg('abc')).toThrow(
      'Error: --notify threshold must be a number between 0 and 100.',
    );
    expect(() => parseNotifyThresholdArg('-1')).toThrow(
      'Error: --notify threshold must be a number between 0 and 100.',
    );
    expect(() => parseNotifyThresholdArg('101')).toThrow(
      'Error: --notify threshold must be a number between 0 and 100.',
    );
  });
});

describe('validateNotifyRuntime', () => {
  test('allows no notify threshold in any mode', () => {
    expect(validateNotifyRuntime(null, false, false)).toBeNull();
    expect(validateNotifyRuntime(null, true, true)).toBeNull();
  });

  test('requires watch mode when notify threshold is set', () => {
    expect(validateNotifyRuntime(0.2, false, true)).toBe('Error: --notify requires --watch.');
  });

  test('requires supported notification backend when threshold is set', () => {
    expect(validateNotifyRuntime(0.2, true, false)).toBe(
      'Error: --notify is not supported on this system (missing notify-send).',
    );
  });

  test('passes when notify threshold is set in watch mode with support', () => {
    expect(validateNotifyRuntime(0.2, true, true)).toBeNull();
  });
});

describe('shouldSendThresholdNotification', () => {
  test('returns false when there is no previous datapoint', () => {
    expect(shouldSendThresholdNotification(undefined, 0.1, 0.2)).toBeFalse();
  });

  test('returns true only when crossing from above threshold to at-or-below threshold', () => {
    expect(shouldSendThresholdNotification(0.3, 0.2, 0.2)).toBeTrue();
    expect(shouldSendThresholdNotification(0.3, 0.1, 0.2)).toBeTrue();
  });

  test('returns false when not crossing the threshold', () => {
    expect(shouldSendThresholdNotification(0.2, 0.2, 0.2)).toBeFalse();
    expect(shouldSendThresholdNotification(0.15, 0.1, 0.2)).toBeFalse();
    expect(shouldSendThresholdNotification(0.3, 0.25, 0.2)).toBeFalse();
  });
});

describe('parseWatchIntervalArg', () => {
  test('defaults missing unit chunks to seconds in display string', () => {
    expect(parseWatchIntervalArg('20')).toEqual({ intervalMs: 20000, intervalStr: '20s' });
    expect(parseWatchIntervalArg('1m20')).toEqual({ intervalMs: 80000, intervalStr: '1m20s' });
  });

  test('preserves explicit units and computes total milliseconds', () => {
    expect(parseWatchIntervalArg('5m')).toEqual({ intervalMs: 300000, intervalStr: '5m' });
    expect(parseWatchIntervalArg('1h2m3s')).toEqual({ intervalMs: 3723000, intervalStr: '1h2m3s' });
  });

  test('returns null when no interval chunks are present', () => {
    expect(parseWatchIntervalArg('abc')).toBeNull();
  });
});
