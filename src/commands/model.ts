import { getFlag, getPositional, rejectUnknownFlags } from '../args.js';
import { AxiError } from '../errors.js';
import { asArray, asObject, mesheryctlExec, mesheryctlJson } from '../mesheryctl.js';
import { getSuggestions } from '../suggestions.js';
import {
  emptyState,
  field,
  renderDetail,
  renderHelp,
  renderList,
  renderOutput,
  type FieldDef,
} from '../toon.js';

export const MODEL_FLAGS: Record<string, readonly string[]> = {
  list: ['--page', '--pagesize', '--limit', '--count'],
  view: [],
  content: ['--format'],
};

export const MODEL_HELP = `usage: mesheryctl-axi model <subcommand>
subcommands[3]:
  list, view, content
flags{list}:
  --page, --pagesize, --limit, --count
flags{content}:
  --format yaml|json (default json)
notes:
  content returns schema-faithful YAML/JSON - never TOON
examples:
  mesheryctl-axi model list
  mesheryctl-axi model view <name>
  mesheryctl-axi model content <name> --format json
`;

const listSchema: FieldDef[] = [
  field('name'),
  field('version'),
  field('category'),
  field('displayname', 'display'),
];

const viewSchema: FieldDef[] = [
  field('name'),
  field('version'),
  field('category'),
  field('displayname', 'display'),
  field('registrant'),
];

async function listModels(args: string[]): Promise<string> {
  const mArgs = ['model', 'list', '--output-format', 'json'];
  const page = getFlag(args, '--page');
  const pagesize = getFlag(args, '--pagesize') ?? getFlag(args, '--limit');
  if (page) mArgs.push('--page', page);
  if (pagesize) mArgs.push('--pagesize', pagesize);
  if (args.includes('--count')) mArgs.push('--count');

  const payload = await mesheryctlJson(mArgs);
  const items = asArray(payload, ['models', 'data', 'results']);
  const isEmpty = items.length === 0;
  return renderOutput([
    isEmpty ? emptyState('models') : renderList('models', items, listSchema),
    renderHelp(getSuggestions({ domain: 'model', action: 'list', isEmpty })),
  ]);
}

async function viewModel(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      'Model name is required: mesheryctl-axi model view <name>',
      'VALIDATION_ERROR',
    );
  }
  const payload = await mesheryctlJson(['model', 'view', name, '--output-format', 'json']);
  return renderOutput([
    renderDetail('model', asObject(payload), viewSchema),
    renderHelp(getSuggestions({ domain: 'model', action: 'view' })),
  ]);
}

/**
 * Schema-faithful content retrieve - YAML/JSON only, NEVER TOON-as-content.
 */
async function contentModel(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      'Model name is required: mesheryctl-axi model content <name> [--format yaml|json]',
      'VALIDATION_ERROR',
    );
  }
  const format = (getFlag(args, '--format') ?? 'json').toLowerCase();
  if (format !== 'yaml' && format !== 'json') {
    throw new AxiError(`--format must be yaml or json (got ${format})`, 'VALIDATION_ERROR');
  }
  const raw = await mesheryctlExec(['model', 'view', name, '--output-format', format]);
  return raw.endsWith('\n') ? raw : `${raw}\n`;
}

export async function modelCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === '--help' || sub === '-h' || sub === undefined) {
    return MODEL_HELP;
  }
  switch (sub) {
    case 'list':
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.list, 'model', 'list');
      return listModels(args.slice(1));
    case 'view':
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.view, 'model', 'view');
      return viewModel(args.slice(1));
    case 'content':
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.content, 'model', 'content');
      return contentModel(args.slice(1));
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, 'VALIDATION_ERROR', [
        'Available subcommands: list, view, content',
        'mesheryctl-axi model --help',
      ]);
  }
}
