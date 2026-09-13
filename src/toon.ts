import { encode } from '@toon-format/toon';

/**
 * Field extractor definitions for transforming mesheryctl JSON into flat TOON-friendly objects.
 */
export type FieldDef =
  | { type: 'field'; key: string; as?: string }
  | { type: 'pluck'; key: string; subkey: string; as?: string }
  | {
      type: 'joinArray';
      key: string;
      subkey: string;
      as?: string;
      empty?: string;
    }
  | { type: 'lower'; key: string; as?: string }
  | {
      type: 'custom';
      as: string;
      fn: (item: Record<string, unknown>) => unknown;
    };

export function field(key: string, as?: string): FieldDef {
  return { type: 'field', key, as };
}

export function pluck(key: string, subkey: string, as?: string): FieldDef {
  return { type: 'pluck', key, subkey, as };
}

export function joinArray(key: string, subkey: string, as?: string, empty = 'none'): FieldDef {
  return { type: 'joinArray', key, subkey, as, empty };
}

export function lower(key: string, as?: string): FieldDef {
  return { type: 'lower', key, as };
}

export function custom(as: string, fn: (item: Record<string, unknown>) => unknown): FieldDef {
  return { type: 'custom', as, fn };
}

export function extract(
  item: Record<string, unknown>,
  schema: FieldDef[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const def of schema) {
    const outputKey = def.as ?? ('key' in def ? def.key : def.as);

    switch (def.type) {
      case 'field':
        result[outputKey] = item[def.key] ?? null;
        break;

      case 'pluck':
        result[outputKey] =
          (item[def.key] as Record<string, unknown> | undefined)?.[def.subkey] ?? null;
        break;

      case 'joinArray': {
        const arr = item[def.key];

        if (Array.isArray(arr) && arr.length > 0) {
          result[outputKey] = arr
            .map((x: unknown) =>
              typeof x === 'string' ? x : (x as Record<string, unknown>)[def.subkey],
            )
            .join(',');
        } else {
          result[outputKey] = def.empty ?? 'none';
        }

        break;
      }

      case 'lower': {
        const value = item[def.key];
        result[outputKey] = typeof value === 'string' ? value.toLowerCase() : value;

        break;
      }
      case 'custom':
        result[outputKey] = def.fn(item);
        break;

      default: {
        const _exhaustive: never = def;
        throw new Error(`Unknown field type: ${(_exhaustive as FieldDef).type}`);
      }
    }
  }

  return result;
}

/** Render a labeled list of items as TOON. */
export function renderList(
  label: string,
  items: Record<string, unknown>[],
  schema: FieldDef[],
): string {
  const extracted = items.map((item) => extract(item, schema));
  return encode({ [label]: extracted });
}

/** Render a single labeled detail object as TOON. */
export function renderDetail(
  label: string,
  item: Record<string, unknown>,
  schema: FieldDef[],
): string {
  const extracted = extract(item, schema);
  return encode({ [label]: extracted });
}

/**
 * Render help suggestions manually because encode() inlines primitive arrays.
 */
export function renderHelp(lines: string[]): string {
  if (lines.length === 0) return '';

  const indented = lines.map((line) => `  ${line}`).join('\n');
  return `help[${lines.length}]:\n${indented}`;
}

/** Render an error in TOON format. */
export function renderError(message: string, code: string, suggestions: string[] = []): string {
  const blocks = [encode({ error: message, code })];

  if (suggestions.length > 0) {
    blocks.push(renderHelp(suggestions));
  }

  return blocks.join('\n');
}

/** Combine multiple TOON blocks into a single output string. */
export function renderOutput(blocks: string[]): string {
  return blocks.filter(Boolean).join('\n');
}

/** Definitive empty-state line for a resource collection. */
export function emptyState(label: string): string {
  return `${label}: 0`;
}
