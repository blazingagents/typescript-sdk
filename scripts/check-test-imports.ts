import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const entries = ["src/index.ts", "src/contracts/index.ts"].map((path) =>
  resolve(root, path)
);
const message =
  "Tests must use the public API. Either rewrite this test against the public client, or, if the test really needs this value, the SDK is missing a public way to get it: add one to the public API (with docs) and use that.";

const reExportPattern =
  /^export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/gm;
const unsupportedExportPattern =
  /^export\s+(?!(?:type\s+)?\{[^}]*\}\s+from\s)[^\n]*/m;
const importPattern =
  /^(?:import|export)\s+(?:type\s+)?(?:(?<default>[\w$]+)\s*,?\s*)?(?:(?<namespace>\*)(?:\s+as\s+[\w$]+)?|\{(?<named>[^}]*)\})?\s*from\s+["'](?<specifier>\.[^"']*)["']/dgm;
const wholeModulePattern =
  /^import\s+["'](\.[^"']*)["']|\b(?:import|require|vi\.(?:mock|doMock|importActual|importMock))(?:<[^>]*>)?\(\s*["'`](\.[^"'`]*)["'`]/gm;
// Vitest's default include: any *.test.* or *.spec.* JS/TS file.
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const sourceFilePattern = /\.[cm]?[jt]sx?$/;
const jsExtensionPattern = /\.([cm]?)js$/;
const skippedDirs = new Set([".git", "dist", "node_modules"]);
const specifierPattern = /(?:\btype\s+)?([\w$]+)(?:\s+as\s+[\w$]+)?/g;

function specifierNames(list: string): { name: string; offset: number }[] {
  return [...list.matchAll(specifierPattern)].map((match) => ({
    name: match[1],
    offset: match.index,
  }));
}

/** Maps each SDK module to the names the public entry points re-export from it. */
function publicExports(): Map<string, Set<string>> {
  const byModule = new Map<string, Set<string>>();
  for (const entry of entries) {
    const text = readFileSync(entry, "utf8");
    const unsupported = text.match(unsupportedExportPattern);
    if (unsupported) {
      throw new Error(
        `${relative(root, entry)}: unsupported export form "${unsupported[0]}"; extend scripts/check-test-imports.ts to read it.`
      );
    }
    for (const [, list, specifier] of text.matchAll(reExportPattern)) {
      const target = resolve(dirname(entry), specifier);
      const names = byModule.get(target) ?? new Set<string>();
      for (const { name } of specifierNames(list)) {
        names.add(name);
      }
      byModule.set(target, names);
    }
  }
  return byModule;
}

function isTestSupport(path: string): boolean {
  return relative(root, path).split(sep).includes("test");
}

/** Every file a test runner or test typecheck can load: test files anywhere, plus test support and `tests/`. */
function testFiles(): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => !skippedDirs.has(entry.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? readdirSync(join(root, entry.name), {
            recursive: true,
            encoding: "utf8",
          }).map((path) => join(entry.name, path))
        : [entry.name]
    )
    .filter(
      (path) =>
        sourceFilePattern.test(path) &&
        (testFilePattern.test(path) ||
          path.startsWith(`tests${sep}`) ||
          isTestSupport(join(root, path)))
    )
    .map((path) => join(root, path));
}

/** Resolves a relative specifier the way TypeScript and Vite do: `.js` to `.ts`, no extension, or a directory index. */
function resolveSpecifier(file: string, specifier: string): string {
  const path = resolve(dirname(file), specifier);
  const candidates = [
    path,
    path.replace(jsExtensionPattern, ".$1ts"),
    `${path}.ts`,
    join(path, "index.ts"),
  ];
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile()
    ) ?? path
  );
}

const allowed = publicExports();
const violations: string[] = [];

function check(
  file: string,
  text: string,
  index: number,
  specifier: string,
  name: string
) {
  const target = resolveSpecifier(file, specifier);
  if (
    entries.includes(target) ||
    isTestSupport(target) ||
    !target.startsWith(join(root, "src") + sep) ||
    allowed.get(target)?.has(name)
  ) {
    return;
  }
  const line = text.slice(0, index).split("\n").length;
  violations.push(
    `${relative(root, file)}:${line}: "${name}" from ${relative(root, target)}`
  );
}

for (const file of testFiles()) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const { groups, indices } = match;
    if (!(groups && indices?.groups)) {
      continue;
    }
    const { specifier } = groups;
    if (groups.default) {
      check(file, text, indices.groups.default[0], specifier, "default");
    }
    if (groups.namespace) {
      check(file, text, indices.groups.namespace[0], specifier, "*");
    }
    if (groups.named) {
      const listStart = indices.groups.named[0];
      for (const { name, offset } of specifierNames(groups.named)) {
        check(file, text, listStart + offset, specifier, name);
      }
    }
  }
  for (const match of text.matchAll(wholeModulePattern)) {
    check(file, text, match.index, match[1] ?? match[2], "*");
  }
}

if (violations.length > 0) {
  console.error(`${violations.join("\n")}\n\n${message}`);
  process.exit(1);
}
