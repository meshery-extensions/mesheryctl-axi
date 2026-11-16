'use strict';

// TypeScript 7.0.2 is the `typescript` package so `tsc` stays 7.0.2, but that
// package has no compiler API. typescript-eslint and prettier-plugin-organize-imports
// still require the TypeScript 6 API. Point those requires at @typescript/typescript6
// without installing a package named @typescript/native (that name makes npm 10
// fetch a TypeScript nightly for an optional peer).

const Module = require('module');

const ts6Entry = require.resolve('@typescript/typescript6');
const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'typescript') {
    return ts6Entry;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};
