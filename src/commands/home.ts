import { encode } from '@toon-format/toon';
import { asObject, mesheryctlRaw } from '../mesheryctl.js';
import { getSuggestions } from '../suggestions.js';
import { field, renderDetail, renderHelp, renderOutput, type FieldDef } from '../toon.js';

const statusSchema: FieldDef[] = [
  field('status'),
  field('version'),
  field('platform'),
  field('provider')
];

const contextSchema: FieldDef[] = [
  field('name'),
  field('endpoint'),
  field('token'),
  field('platform')
];

/**
 * Content-first home (no args).
 * axi-sdk-js prepends bin + description; we add best-effort system slices + help[].
 */
export async function homeCommand(_args: string[]): Promise<string> {
  const blocks: string[] = [];

  const [statusRaw, contextRaw] = await Promise.all([
    mesheryctlRaw(['system', 'status', '--output-format', 'json']).catch(() => null),
    mesheryctlRaw(['system', 'context', 'view', '--output-format', 'json']).catch(() => null)
  ]);

  if (statusRaw && statusRaw.exitCode === 0 && statusRaw.stdout.trim()) {
    try {
      const obj = asObject(JSON.parse(statusRaw.stdout));
      blocks.push(renderDetail('system_status', obj, statusSchema));
    } catch {
      blocks.push(encode({ system_status: statusRaw.stdout.trim().slice(0, 240) }));
    }
  } else {
    blocks.push(encode({ system_status: 'unavailable' }));
  }

  if (contextRaw && contextRaw.exitCode === 0 && contextRaw.stdout.trim()) {
    try {
      const obj = asObject(JSON.parse(contextRaw.stdout));
      blocks.push(renderDetail('system_context', obj, contextSchema));
    } catch {
      blocks.push(encode({ system_context: contextRaw.stdout.trim().slice(0, 240) }));
    }
  } else {
    blocks.push(encode({ system_context: 'unavailable' }));
  }

  blocks.push(renderHelp(getSuggestions({ domain: 'home', action: 'home' })));
  return renderOutput(blocks);
}
