const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(path, dependencies, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}

test("offline catalog fallback isolates mode, locale and page", async () => {
  const storage = new Map();
  let locale = "ru";
  let kidsMode = false;
  let online = true;
  const settings = { getUserSettings: () => ({ kidsMode }) };
  const language = { getLocale: () => locale };
  const utils = { API_BASE: "http://example.invalid", isGhostCatalogItem: () => false };
  const cache = loadModule("src/api/cache.ts", {
    "./utils": utils,
    "../i18n/state": language,
    "../runtime/userSettings": settings,
  }, {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  const { fetchCatalog } = loadModule("src/services/mediaService.ts", {
    "../api/cache": cache,
    "../api/utils": utils,
    "../i18n/state": language,
    "../runtime/userSettings": settings,
  }, {
    fetch: async (url) => {
      if (!online) throw new Error("offline");
      const page = Number(new URL(url).searchParams.get("page"));
      return { ok: true, json: async () => ({ results: [{ id: page, title: "Fixture", adult: true }] }) };
    },
  });

  await fetchCatalog("watching_today", "home", 1);
  await fetchCatalog("watching_today", "home", 2);
  online = false;
  assert.equal((await fetchCatalog("watching_today", "home", 1))[0].id, 1);
  assert.equal((await fetchCatalog("watching_today", "home", 2))[0].id, 2);

  kidsMode = true;
  assert.equal(cache.getCachedCatalog("watching_today", "home"), null);
  assert.equal((await fetchCatalog("watching_today", "home")).length, 0);

  kidsMode = false;
  locale = "en";
  assert.equal((await fetchCatalog("watching_today", "home")).length, 0);
});
