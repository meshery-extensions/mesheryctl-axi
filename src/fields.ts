import { getFlag, hasFlag } from './args.js';
import { AxiError } from './errors.js';
import type { FieldDef } from './toon.js';

function outputName(def: FieldDef): string {
  return def.as ?? ('key' in def ? def.key : def.as);
}

/** Resolve the reporting schema selected by --fields or --full. */
export function selectFields(
  args: string[],
  defaultSchema: FieldDef[],
  fullSchema: FieldDef[],
  command: string,
): FieldDef[] {
  const fieldsWasPassed = args.some((arg) => arg === '--fields' || arg.startsWith('--fields='));
  const invalidFull = args.find((arg) => arg.startsWith('--full='));
  if (invalidFull) {
    throw new AxiError(
      `${invalidFull} is invalid; --full does not take a value`,
      'VALIDATION_ERROR',
      [`mesheryctl-axi ${command} --full`],
    );
  }

  const full = hasFlag(args, '--full');
  if (full && fieldsWasPassed) {
    throw new AxiError('--fields and --full cannot be used together', 'VALIDATION_ERROR', [
      `mesheryctl-axi ${command} --fields <field,...>`,
      `mesheryctl-axi ${command} --full`,
    ]);
  }
  if (full) return fullSchema;
  if (!fieldsWasPassed) return defaultSchema;

  const value = getFlag(args, '--fields')?.trim();
  const valid = fullSchema.map(outputName);
  if (!value) {
    throw new AxiError('--fields requires a comma-separated value', 'VALIDATION_ERROR', [
      `Valid fields: ${valid.join(', ')}`,
    ]);
  }

  const requested = [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  if (requested.length === 0) {
    throw new AxiError('--fields requires a comma-separated value', 'VALIDATION_ERROR', [
      `Valid fields: ${valid.join(', ')}`,
    ]);
  }
  const unknown = requested.filter((name) => !valid.includes(name));
  if (unknown.length > 0) {
    throw new AxiError(
      `unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      'VALIDATION_ERROR',
      [`Valid fields: ${valid.join(', ')}`],
    );
  }

  const byName = new Map(fullSchema.map((def) => [outputName(def), def]));
  return requested.map((name) => byName.get(name)!);
}
