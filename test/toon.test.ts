import { describe, expect, it } from 'vitest';
import {
  emptyState,
  extract,
  field,
  lower,
  renderDetail,
  renderError,
  renderHelp,
  renderList,
  renderOutput
} from '../src/toon.js';

describe('TOON encoding', () => {
  it('extracts fields into flat objects', () => {
    const item = { id: 'c1', name: 'k8s', status: 'CONNECTED' };
    const out = extract(item, [field('id'), field('name'), lower('status')]);
    expect(out).toEqual({ id: 'c1', name: 'k8s', status: 'connected' });
  });

  it('renderList encodes a labeled array as TOON', () => {
    const items = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' }
    ];
    const toon = renderList('connections', items, [field('id'), field('name')]);
    expect(toon).toContain('connections');
    expect(toon).toContain('1');
    expect(toon).toContain('a');
    expect(toon).not.toMatch(/^\s*\{/); // not JSON object dump
  });

  it('renderDetail encodes a single object as TOON', () => {
    const toon = renderDetail('connection', { id: 'x', name: 'y' }, [field('id'), field('name')]);
    expect(toon).toContain('connection');
    expect(toon).toContain('x');
  });

  it('renderError produces structured TOON error', () => {
    const err = renderError('boom', 'VALIDATION_ERROR', ['try again']);
    expect(err).toContain('error');
    expect(err).toContain('boom');
    expect(err).toContain('VALIDATION_ERROR');
    expect(err).toContain('help[');
  });

  it('renderOutput joins blocks', () => {
    expect(renderOutput(['a', '', 'b'])).toBe('a\nb');
  });
});

describe('empty states', () => {
  it('emptyState is definitive', () => {
    expect(emptyState('connections')).toBe('connections: 0');
    expect(emptyState('designs')).toBe('designs: 0');
    expect(emptyState('models')).toBe('models: 0');
    expect(emptyState('components')).toBe('components: 0');
  });
});

describe('help[]', () => {
  it('renderHelp formats count and indented lines', () => {
    const help = renderHelp(['mesheryctl-axi connection list', 'next']);
    expect(help).toMatch(/^help\[2\]:/);
    expect(help).toContain('mesheryctl-axi connection list');
  });

  it('renderHelp returns empty string for no lines', () => {
    expect(renderHelp([])).toBe('');
  });
});
