import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
export function loadMoneyModule(path, mocks = {}, suffix = '', cache = new Map()) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  cache.set(file, loaded.exports);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8') + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependency = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return loadMoneyModule('src/' + name.slice(2) + '.ts', mocks, '', cache);
    if (name.startsWith('.')) return loadMoneyModule(resolve(dirname(file), name + '.ts'), mocks, '', cache);
    return require(name);
  };
  new Function('require', 'module', 'exports', compiled)(dependency, loaded, loaded.exports);
  return loaded.exports;
}
