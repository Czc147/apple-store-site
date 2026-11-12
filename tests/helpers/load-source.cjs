const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function loadSource(file, stubs = {}, cache = new Map()) {
  const filename = path.isAbsolute(file) ? file : path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      const resolved = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw new Error('Cannot resolve ' + id + ' from ' + filename);
      return loadSource(resolved, stubs, cache);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const api = {
  ok: (body, status = 200) => Response.json(body, { status }),
  fail: (error, status = 400) => Response.json({ error }, { status }),
  parseBody: req => req.json(),
};
function database(resolve) {
  return { from(table) {
    const state = { table, op: 'read', filters: [], from: 0, to: Infinity };
    let query;
    query = new Proxy({}, { get(_, method) {
      if (method === 'then') return (yes, no) => Promise.resolve().then(() => resolve(state)).then(yes, no);
      return (...args) => {
        if (['insert', 'update', 'delete'].includes(method)) { state.op = method; state.payload = args[0]; }
        if (method === 'select') state.columns = args[0];
        if (method === 'range') [state.from, state.to] = args;
        if (['eq', 'is', 'in'].includes(method)) state.filters.push([method, ...args]);
        return query;
      };
    } });
    return query;
  } };
}
module.exports = { loadSource, database, api };
