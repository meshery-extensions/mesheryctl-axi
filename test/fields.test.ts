import { describe, expect, it } from 'vitest';
import { selectFields } from '../src/fields.js';
import { field } from '../src/toon.js';

const compact = [field('id'), field('name')];
const full = [...compact, field('created_at', 'created')];

describe('field selection', () => {
  it('keeps compact defaults and honors requested order', () => {
    expect(selectFields([], compact, full, 'connection list')).toBe(compact);
    expect(selectFields(['--fields', 'created,id'], compact, full, 'connection list')).toEqual([
      full[2],
      full[0],
    ]);
  });

  it('uses the full known schema with --full', () => {
    expect(selectFields(['--full'], compact, full, 'connection list')).toBe(full);
  });

  it.each([
    ['unknown field', ['--fields', 'bogus']],
    ['missing field value', ['--fields']],
    ['mutually exclusive controls', ['--fields', 'id', '--full']],
    ['boolean value', ['--full=true']],
  ])('rejects %s', (_label, args) => {
    expect(() => selectFields(args, compact, full, 'connection list')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('includes valid fields when a normalized field list is empty', () => {
    try {
      selectFields(['--fields=,,,'], compact, full, 'connection list');
      expect.fail('should throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        suggestions: ['Valid fields: id, name, created'],
      });
    }
  });
});
