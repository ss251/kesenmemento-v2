// [ui-c2] Ask for each key once: concurrent and later callers share the first caller's promise. A key that failed is forgotten, so the next caller tries again.
// world/layout.js uses it for loadData() in the browser: environment, the schools and explore each fetched explore.json (2 MB) on their own (three requests, mobile review F24).
//
//   const once = onceByKey((name) => fetchJson(name));   once('a.json'); once('a.json');   // one fetch
export function onceByKey(fn, cache = new Map()) {
  return (key) => {
    let p = cache.get(key);
    if (p) return p;
    try { p = Promise.resolve(fn(key)); } catch (e) { p = Promise.reject(e); }
    cache.set(key, p);
    p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
    return p;
  };
}
