import { describe, expect, it } from 'vitest';
import type { Requirement, RequirementsPayload, SubRequirement } from '../lib/types';
import { reviewedPayload } from './Requirements';

function criterion(name: string, overrides: Partial<SubRequirement> = {}): SubRequirement {
  return {
    name,
    description: `Evidence for ${name}`,
    mandatory: true,
    evidence_types: ['Audited financial statements'],
    source_page: 7,
    source_text: 'Clause 4.2: Submit audited accounts and meet the minimum turnover.',
    condition: null,
    thresholds: [],
    review_required: true,
    ...overrides,
  };
}

function group(name: string, overrides: Partial<Requirement> = {}): Requirement {
  return {
    ...criterion(name),
    domain: 'financial',
    category: 'eligibility',
    requirement_type: 'evidence',
    sub_requirements: [],
    ...overrides,
  };
}

function payload(): RequirementsPayload {
  return {
    extraction_method: 'heuristic',
    fallback_reason: 'ConnectionError',
    warnings: ['Review conservative extraction for completeness.'],
    requirements: [
      group('Financial standing', {
        sub_requirements: [
          criterion('Audited accounts'),
          criterion('Minimum turnover', {
            source_page: 9,
            source_text: 'Minimum average annual turnover of Rs. 25 lakhs.',
            thresholds: [{ name: 'minimum annual turnover', value: '25', unit: 'lakhs' }],
          }),
        ],
      }),
      group('OEM authorisation', { mandatory: false, condition: 'Applies when bidder is not the OEM.' }),
    ],
  };
}

describe('reviewed tender requirement scope', () => {
  it('removes a selected child without flattening its surviving group or losing evidence metadata', () => {
    const original = payload();
    const selected = reviewedPayload(original, ['r:0:0']);

    expect(selected.extraction_method).toBe('officer_reviewed');
    expect(selected.requirements).toHaveLength(2);
    expect(selected.requirements[0].name).toBe('Financial standing');
    expect(selected.requirements[0].sub_requirements).toEqual([original.requirements[0].sub_requirements[1]]);
    expect(selected.requirements[0].sub_requirements[0]).toMatchObject({
      source_page: 9,
      source_text: 'Minimum average annual turnover of Rs. 25 lakhs.',
      thresholds: [{ name: 'minimum annual turnover', value: '25', unit: 'lakhs' }],
      evidence_types: ['Audited financial statements'],
    });
    expect(selected.fallback_reason).toBe(original.fallback_reason);
    expect(selected.warnings).toEqual(original.warnings);
  });

  it('removes a group when all children are excluded instead of resurrecting the parent as evidence', () => {
    const selected = reviewedPayload(payload(), ['r:0:0', 'r:0:1']);

    expect(selected.requirements.map(requirement => requirement.name)).toEqual(['OEM authorisation']);
    expect(selected.requirements[0].mandatory).toBe(false);
    expect(selected.requirements[0].condition).toBe('Applies when bidder is not the OEM.');
  });

  it('honours parent exclusions and keeps independent requirements without children', () => {
    const original = payload();
    expect(reviewedPayload(original, ['r:0']).requirements).toEqual([original.requirements[1]]);
    expect(reviewedPayload(original, ['r:0', 'r:1']).requirements).toEqual([]);
    expect(reviewedPayload(original, []).requirements).toEqual(original.requirements);
  });

  it('makes an applicable conditional group required without changing its original condition or child flags', () => {
    const original = payload();
    original.requirements[1].sub_requirements = [
      criterion('OEM letter'), criterion('Additional literature', { mandatory: false }),
    ];
    const selected = reviewedPayload(original, [], { 'r:1': true });

    expect(selected.requirements[1].mandatory).toBe(true);
    expect(selected.requirements[1].condition).toBe('Applies when bidder is not the OEM.');
    expect(selected.requirements[1].sub_requirements.map(child => child.mandatory)).toEqual([true, false]);
    expect(original.requirements[1].mandatory).toBe(false);
  });

  it('applies independent child overrides using original indexes after exclusions', () => {
    const original = payload();
    const selected = reviewedPayload(original, ['r:0:0'], { 'r:0:1': false, 'r:1': true });

    expect(selected.requirements[0].mandatory).toBe(true);
    expect(selected.requirements[0].sub_requirements[0]).toEqual({
      ...original.requirements[0].sub_requirements[1], mandatory: false,
    });
    expect(selected.requirements[1]).toEqual({ ...original.requirements[1], mandatory: true });
  });

  it('keeps explicit false overrides and never restores excluded groups via required-status changes', () => {
    const original = payload();
    expect(reviewedPayload(original, [], { 'r:0': false }).requirements[0].mandatory).toBe(false);
    expect(reviewedPayload(original, ['r:0:0', 'r:0:1'], { 'r:0': true }).requirements.map(r => r.name))
      .toEqual(['OEM authorisation']);
    expect(reviewedPayload(original, ['r:1'], { 'r:1': true }).requirements.map(r => r.name))
      .toEqual(['Financial standing']);
  });

  it('does not mutate the original extraction, nested criterion arrays, or exclusion selection', () => {
    const original = payload();
    const snapshot = structuredClone(original);
    const exclusions = ['r:0:0'];
    original.requirements.forEach(requirement => {
      Object.freeze(requirement.sub_requirements);
      Object.freeze(requirement);
    });
    Object.freeze(original.requirements);
    Object.freeze(original);
    Object.freeze(exclusions);
    const overrides = Object.freeze({ 'r:0:1': false, 'r:1': true });

    const selected = reviewedPayload(original, exclusions, overrides);
    expect(original).toEqual(snapshot);
    expect(exclusions).toEqual(['r:0:0']);
    expect(overrides).toEqual({ 'r:0:1': false, 'r:1': true });
    expect(selected).not.toBe(original);
    expect(selected.requirements).not.toBe(original.requirements);
    expect(selected.requirements[0].sub_requirements).not.toBe(original.requirements[0].sub_requirements);
  });
});
