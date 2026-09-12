import { describe, expect, it } from 'vitest';
import { getFlagValues, rejectUnknownFlags } from '../src/args.js';
import { AxiError } from '../src/errors.js';

describe('unknown flags', () => {
  it('allows known flags', () => {
    expect(() =>
      rejectUnknownFlags(
        ['--page', '1'],
        ['--page', '--limit'],
        'design',
        'list',
      ),
    ).not.toThrow();
  });

  it('rejects unknown flags with VALIDATION_ERROR', () => {
    try {
      rejectUnknownFlags(['--wat'], ['--page'], 'design', 'list');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AxiError);
      const err = e as AxiError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toContain('--wat');
      expect(err.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('ignores --help and positionals', () => {
    expect(() =>
      rejectUnknownFlags(['my-name', '--help'], [], 'design', 'view'),
    ).not.toThrow();
  });

  it('reads repeated and comma-separated flag values', () => {
    expect(
      getFlagValues(
        ['--kind', 'kubernetes,meshery', '-k=grafana'],
        ['--kind', '-k'],
      ),
    ).toEqual(['kubernetes', 'meshery', 'grafana']);
  });
});