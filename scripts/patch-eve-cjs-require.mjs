/**
 * Workaround for an eve 0.67.1 packaging bug.
 *
 * eve vendors several CommonJS dependencies into `eve/dist/src/node_modules/`
 * and rewrites them as ES modules, but leaves their bare `require(...)` calls
 * intact without emitting a `createRequire` shim. Importing any module that
 * reaches one of them throws:
 *
 *   ReferenceError: require is not defined in ES module scope
 *
 * `eve/extensions/code/sandbox` reaches `jose` through the vendored
 * `@vercel/connect`, so `agent/sandbox.ts` cannot evaluate without this fix.
 *
 * This script prepends a module-scope `createRequire` shim to every affected
 * vendored file. It is idempotent, scoped to eve's vendored tree, and becomes a
 * no-op once eve ships the shim itself. Remove it when that happens.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const MARKER = "__eveCjsRequireShim";
const SHIM =
  `import{createRequire as ${MARKER}}from"node:module";` +
  `const require=${MARKER}(import.meta.url);\n`;

/** Bare `require(` — not `.require(`, `foo_require(`, or `$require(`. */
const BARE_REQUIRE = /(^|[^.\w$])require\s*\(/;

function vendoredRoot() {
  const require = createRequire(import.meta.url);
  let evePackageJson;
  try {
    evePackageJson = require.resolve("eve/package.json");
  } catch {
    return null;
  }
  return join(dirname(evePackageJson), "dist", "src", "node_modules");
}

function* jsFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(path);
    else if (entry.isFile() && entry.name.endsWith(".js")) yield path;
  }
}

const root = vendoredRoot();
if (!root) process.exit(0);
try {
  statSync(root);
} catch {
  process.exit(0);
}

let patched = 0;
for (const file of jsFiles(root)) {
  const source = readFileSync(file, "utf8");
  if (source.includes(MARKER)) continue;
  if (!BARE_REQUIRE.test(source)) continue;
  writeFileSync(file, SHIM + source);
  patched += 1;
}

if (patched > 0) {
  console.info(`patch-eve-cjs-require: shimmed ${patched} vendored eve module(s)`);
}
