import { describe, expect, it } from 'vitest';
import {
  partitionDay,
  partitionName,
  planPartitions,
} from './partition-plan.js';

const NOW = new Date('2026-11-27T15:30:00Z');

describe('partition names', () => {
  it('names a partition after its day', () => {
    expect(partitionName('2026-11-27')).toBe('click_events_p20261127');
  });

  it('reads the day back from a partition name', () => {
    expect(partitionDay('click_events_p20261127')).toBe('2026-11-27');
  });

  it.each(['click_events_default', 'click_events', 'click_events_p2026'])(
    'does not mistake %s for a daily partition',
    (name) => {
      expect(partitionDay(name)).toBeNull();
    },
  );
});

describe('planPartitions', () => {
  it('prepares today and the next seven days', () => {
    const plan = planPartitions({
      now: NOW,
      existingDays: [],
      daysWaitingInDefault: [],
    });

    expect(plan.create).toEqual([
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ]);
    expect(plan.drop).toEqual([]);
  });

  it('creates only what is missing', () => {
    const plan = planPartitions({
      now: NOW,
      existingDays: ['2026-11-27', '2026-11-28', '2026-11-29'],
      daysWaitingInDefault: [],
    });

    expect(plan.create[0]).toBe('2026-11-30');
    expect(plan.create).toHaveLength(5);
  });

  it('keeps exactly 90 days and drops the day before that', () => {
    const plan = planPartitions({
      now: NOW,
      existingDays: ['2026-08-28', '2026-08-29', '2026-11-26'],
      daysWaitingInDefault: [],
    });

    expect(plan.keepFrom).toBe('2026-08-29');
    expect(plan.drop).toEqual(['2026-08-28']);
  });

  it('gives a day waiting in the default partition its own partition', () => {
    const plan = planPartitions({
      now: NOW,
      existingDays: [],
      daysWaitingInDefault: ['2026-11-20'],
    });

    expect(plan.create).toContain('2026-11-20');
  });

  it('does not create a partition for clicks already past retention', () => {
    const plan = planPartitions({
      now: NOW,
      existingDays: [],
      daysWaitingInDefault: ['2026-08-01'],
    });

    expect(plan.create).not.toContain('2026-08-01');
  });
});
