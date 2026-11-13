import { relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");

interface Entry {
  /** Packages the bundle must not import. */
  forbiddenExternals: string[];
  /** Source files that must contribute no code to the bundle. */
  forbiddenInputs: string[];
  /** Maximum gzipped bytes: the measured size plus about 15% headroom. */
  gzipBudget: number;
  name: string;
  source: string;
  /** The public import a browser app writes. */
  specifier: string;
}

const entries: Entry[] = [
  {
    specifier: "@blazingagents/sdk",
    name: "BlazingAgentsChatTransport",
    source: "src/index.ts",
    gzipBudget: 5100,
    forbiddenExternals: ["react"],
    forbiddenInputs: [
      "src/relay.ts",
      "src/chat-controller.ts",
      "src/chat-state.ts",
    ],
  },
  {
    specifier: "@blazingagents/sdk",
    name: "BlazingAgentsChat",
    source: "src/index.ts",
    gzipBudget: 8500,
    forbiddenExternals: ["react"],
    forbiddenInputs: ["src/relay.ts"],
  },
  {
    specifier: "@blazingagents/sdk/react",
    name: "useBlazingAgentsChat",
    source: "src/react/index.ts",
    gzipBudget: 8400,
    forbiddenExternals: [],
    forbiddenInputs: ["src/relay.ts"],
  },
  {
    specifier: "@blazingagents/sdk/rest",
    name: "BlazingAgentsRest",
    source: "src/rest.ts",
    gzipBudget: 22_900,
    forbiddenExternals: ["ai", "react"],
    forbiddenInputs: ["src/relay.ts"],
  },
];

const externals = ["ai", "zod", "react"];

const failures: string[] = [];

for (const entry of entries) {
  const result = await build({
    stdin: {
      contents: `export { ${entry.name} } from ${JSON.stringify(`./${entry.source}`)};`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    external: externals,
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const label = `import { ${entry.name} } from "${entry.specifier}"`;
  const [output] = result.outputFiles;
  const gzipBytes = gzipSync(output.contents, { level: 9 }).length;
  console.log(
    `${label}: ${gzipBytes} B gzip (budget ${entry.gzipBudget} B), ${output.contents.length} B minified`
  );
  const inputs = Object.values(result.metafile.outputs).flatMap((meta) =>
    Object.entries(meta.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path, input]) => ({
        bytes: input.bytesInOutput,
        path: relative(root, resolve(root, path)),
      }))
  );
  if (gzipBytes > entry.gzipBudget) {
    const largest = inputs
      .toSorted((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map(({ bytes, path }) => `  ${path}: ${bytes} B`);
    failures.push(
      `${label} is ${gzipBytes} B gzipped, over its ${entry.gzipBudget} B budget. Largest inputs:\n${largest.join("\n")}\nRemove the import that pulled them in, or raise the budget in scripts/check-bundle-size.ts if the growth is intended.`
    );
  }
  for (const forbidden of entry.forbiddenInputs) {
    if (inputs.some(({ path }) => path === forbidden)) {
      failures.push(`${label} bundles ${forbidden}, which must stay out.`);
    }
  }
  const imported = Object.values(result.metafile.outputs).flatMap((meta) =>
    meta.imports.filter((item) => item.external).map((item) => item.path)
  );
  for (const forbidden of entry.forbiddenExternals) {
    if (imported.includes(forbidden)) {
      failures.push(`${label} imports "${forbidden}", which it must not.`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.join("\n")}`);
  process.exit(1);
}
