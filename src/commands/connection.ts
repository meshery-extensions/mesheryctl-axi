import { getPositional, rejectUnknownFlags } from '../args.js';
import { AxiError } from '../errors.js';
import { asArray, asObject, mesheryctlJson } from '../mesheryctl.js';
import { getSuggestions } from '../suggestions.js';
import {
  emptyState,
  field,
  lower,
  renderDetail,
  renderHelp,
  renderList,
  renderOutput,
  type FieldDef,
} from '../toon.js';

export const CONNECTION_FLAGS: Record<string, readonly string[]> = {
  list: ['--page', '--pagesize', '--limit'],
  view: [],
};

export const CONNECTION_HELP = `usage: mesheryctl-axi connection <subcommand>
subcommands[2]:
  list, view
flags{list}:
  --page, --pagesize, --limit
examples:
  mesheryctl-axi connection list
  mesheryctl-axi connection view <id>
`;

const listSchema: FieldDef[] = [
  field('id'),
  field('name'),
  lower('status'),
  field('kind'),
  field('type'),
];

const viewSchema: FieldDef[] = [
  field('id'),
  field('name'),
  lower('status'),
  field('kind'),
  field('type'),
  field('created_at', 'created'),
  field('updated_at', 'updated'),
];

async function listConnections(args: string[]): Promise<string> {
  const page = args.includes('--page') ? args[args.indexOf('--page') + 1] : undefined;
  const pagesize = args.includes('--pagesize')
    ? args[args.indexOf('--pagesize') + 1]
    : args.includes('--limit')
      ? args[args.indexOf('--limit') + 1]
      : undefined;

  const mArgs = ['exp', 'connection', 'list', '--output-format', 'json'];
  if (page) mArgs.push('--page', page);
  if (pagesize) mArgs.push('--pagesize', pagesize);

  const payload = await mesheryctlJson(mArgs);
  const items = asArray(payload, ['connections', 'data', 'results']);
  const isEmpty = items.length === 0;
  const suggestions = getSuggestions({
    domain: 'connection',
    action: 'list',
    isEmpty,
  });

  return renderOutput([
    isEmpty ? emptyState('connections') : renderList('connections', items, listSchema),
    renderHelp(suggestions),
  ]);
}

async function viewConnection(args: string[]): Promise<string> {
  const id = getPositional(args, 0);
  if (!id) {
    throw new AxiError(
      'Connection id is required: mesheryctl-axi connection view <id>',
      'VALIDATION_ERROR',
    );
  }

  const payload = await mesheryctlJson([
    'exp',
    'connection',
    'view',
    id,
    '--output-format',
    'json',
  ]);
  const item = asObject(payload);
  const suggestions = getSuggestions({
    domain: 'connection',
    action: 'view',
  });

  return renderOutput([renderDetail('connection', item, viewSchema), renderHelp(suggestions)]);
}

export async function connectionCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === '--help' || sub === '-h' || sub === undefined) {
    return CONNECTION_HELP;
  }
  switch (sub) {
    case 'list':
      rejectUnknownFlags(args.slice(1), CONNECTION_FLAGS.list, 'connection', 'list');
      return listConnections(args.slice(1));
    case 'view':
      rejectUnknownFlags(args.slice(1), CONNECTION_FLAGS.view, 'connection', 'view');
      return viewConnection(args.slice(1));
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, 'VALIDATION_ERROR', [
        'Available subcommands: list, view',
        'mesheryctl-axi connection --help',
      ]);
  }
}
