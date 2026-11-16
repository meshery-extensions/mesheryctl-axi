'use strict';

// @typescript/typescript6 depends on @typescript/old (typescript@6), and that
// package also ships a `tsc` bin. npm links it over TypeScript 7's bin.
// Point `node_modules/.bin/tsc` back at typescript@7.0.2.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const binDir = path.join(root, 'node_modules', '.bin');
const linkPath = path.join(binDir, 'tsc');
const targetAbs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(binDir) || !fs.existsSync(targetAbs)) {
  process.exit(0);
}

fs.rmSync(linkPath, { force: true });
fs.symlinkSync(path.join('..', 'typescript', 'bin', 'tsc'), linkPath);
