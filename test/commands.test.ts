import { afterEach, describe, expect, it } from 'vitest';
import { componentCommand } from '../src/commands/component.js';
import { connectionCommand } from '../src/commands/connection.js';
import { designCommand } from '../src/commands/design.js';
import { homeCommand } from '../src/commands/home.js';
import { modelCommand } from '../src/commands/model.js';
import { systemCommand } from '../src/commands/system.js';
import { AxiError } from '../src/errors.js';
import { setMesheryctlRunner, type ExecResult } from '../src/mesheryctl.js';

function ok(stdout: string): ExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}

afterEach(() => {
  setMesheryctlRunner(undefined);
});

describe('connection list/view', () => {
  it('renders TOON list with help[]', async () => {
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toContain('connection');
      expect(args).toContain('--output-format');
      return ok(
        JSON.stringify({
          connections: [{ id: 'c1', name: 'k8s', status: 'CONNECTED', kind: 'kubernetes' }]
        })
      );
    });
    const out = await connectionCommand(['list']);
    expect(out).toContain('connections');
    expect(out).toContain('c1');
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it('definitive empty state', async () => {
    setMesheryctlRunner(async () => ok(JSON.stringify({ connections: [] })));
    const out = await connectionCommand(['list']);
    expect(out).toContain('connections: 0');
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it('rejects unknown flags', async () => {
    await expect(connectionCommand(['list', '--nope'])).rejects.toBeInstanceOf(AxiError);
  });
});

describe('design content is never TOON', () => {
  it('returns YAML content verbatim', async () => {
    const yaml = 'apiVersion: core.meshery.io/v1alpha1\nkind: Design\nmetadata:\n  name: demo\n';
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual(['design', 'view', 'demo', '--output-format', 'yaml']);
      return ok(yaml);
    });
    const out = await designCommand(['content', 'demo', '--format', 'yaml']);
    expect(out).toBe(yaml.endsWith('\n') ? yaml : `${yaml}\n`);
    expect(out).not.toMatch(/^help\[/);
    expect(out).not.toContain('error:');
  });
});

describe('model content is never TOON', () => {
  it('returns JSON content verbatim', async () => {
    const json = '{\n  "name": "kubernetes",\n  "version": "v1.0.0"\n}\n';
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual(['model', 'view', 'kubernetes', '--output-format', 'json']);
      return ok(json);
    });
    const out = await modelCommand(['content', 'kubernetes', '--format', 'json']);
    expect(out).toBe(json);
    expect(out.trim().startsWith('{')).toBe(true);
  });
});

describe('empty states across resources', () => {
  it('design list empty', async () => {
    setMesheryctlRunner(async () => ok(JSON.stringify({ designs: [] })));
    const out = await designCommand(['list']);
    expect(out).toContain('designs: 0');
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it('model list empty', async () => {
    setMesheryctlRunner(async () => ok(JSON.stringify({ models: [] })));
    const out = await modelCommand(['list']);
    expect(out).toContain('models: 0');
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it('component list empty', async () => {
    setMesheryctlRunner(async () => ok(JSON.stringify({ components: [] })));
    const out = await componentCommand(['list']);
    expect(out).toContain('components: 0');
    expect(out).toMatch(/help\[\d+\]:/);
  });
});

describe('system status/context', () => {
  it('renders TOON status with help[]', async () => {
    setMesheryctlRunner(async (_bin, args) => {
      if (args.includes('status')) {
        return ok(
          JSON.stringify({
            status: 'Running',
            version: '0.8.0',
            platform: 'docker'
          })
        );
      }
      return ok('{}');
    });
    const out = await systemCommand(['status']);
    expect(out).toContain('system_status');
    expect(out).toMatch(/help\[\d+\]:/);
  });
});

describe('home', () => {
  it('includes help[] and best-effort slices', async () => {
    setMesheryctlRunner(async () => ({
      stdout: '',
      stderr: 'fail',
      exitCode: 1
    }));
    const out = await homeCommand([]);
    expect(out).toContain('system_status');
    expect(out).toContain('system_context');
    expect(out).toMatch(/help\[\d+\]:/);
  });
});

describe('unknown flags non-zero path via commands', () => {
  it('design list unknown flag', async () => {
    await expect(designCommand(['list', '--bogus'])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });

  it('model view unknown flag', async () => {
    await expect(modelCommand(['view', 'x', '--weird'])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });

  it('component list unknown flag', async () => {
    await expect(componentCommand(['list', '--nope'])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });
});
