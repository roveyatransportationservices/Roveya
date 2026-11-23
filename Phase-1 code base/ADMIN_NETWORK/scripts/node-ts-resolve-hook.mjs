import path from "node:path";
import { pathToFileURL } from "node:url";

// Node's test runner loads TypeScript, but it does not add .ts to extensionless relative imports.
// Next resolves those imports while bundling. This hook is only for node --test.
export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && !path.extname(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(specifier, context);
    }
  }
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const file = pathToFileURL(path.join(process.cwd(), "src", specifier.slice(2) + ".ts")).href;
    return { url: file, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
