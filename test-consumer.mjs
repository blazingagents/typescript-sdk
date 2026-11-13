import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const consumer = mkdtempSync(join(tmpdir(), "blazingagents-consumer-"));

function lockedVersions(names) {
  return Object.fromEntries(
    names.map((name) => [name, lock.packages[`node_modules/${name}`].version])
  );
}

try {
  execFileSync("npm", ["pack", "--pack-destination", consumer], {
    cwd: root,
    stdio: "inherit",
  });
  for (const path of [
    "tests/consumer",
    "tsconfig.json",
    "tsconfig.consumer.json",
    "vitest.consumer.config.mts",
  ]) {
    cpSync(join(root, path), join(consumer, path), { recursive: true });
  }
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@blazingagents/sdk": `file:./blazingagents-sdk-${manifest.version}.tgz`,
        ai: process.env.CONSUMER_AI_VERSION ?? manifest.peerDependencies.ai,
        ...lockedVersions(["react", "react-dom"]),
        zod: process.env.CONSUMER_ZOD_VERSION ?? manifest.peerDependencies.zod,
      },
      devDependencies: lockedVersions([
        "typescript",
        "vitest",
        "@types/node",
        "@types/json-schema",
        "@types/react",
        "@types/react-dom",
      ]),
    })
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    {
      cwd: consumer,
      stdio: "inherit",
    }
  );
  execFileSync("npm", ["ls", "ai", "zod"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(
    join(consumer, "node_modules/.bin/tsc"),
    ["-p", "tsconfig.consumer.json"],
    { cwd: consumer, stdio: "inherit" }
  );
  execFileSync(
    join(consumer, "node_modules/.bin/vitest"),
    ["run", "-c", "vitest.consumer.config.mts"],
    { cwd: consumer, stdio: "inherit" }
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
