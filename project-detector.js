const MAX_DEPTH = 5;
const MAX_ENTRIES = 2500;
const MAX_TOTAL_MANIFEST_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;

const IGNORED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", ".idea", ".vscode",
  "node_modules", "vendor", "dist", "build", "coverage",
  ".next", ".nuxt", ".svelte-kit", ".astro", ".gradle",
  "target", ".dart_tool", ".pub-cache", ".venv", "venv",
  "__pycache__"
]);

const FRAMEWORKS = [
  { name: "Next.js", kind: "web", dependencies: ["next"] },
  { name: "Nuxt", kind: "web", dependencies: ["nuxt"] },
  { name: "Angular", kind: "web", dependencies: ["@angular/core"] },
  { name: "React", kind: "web", dependencies: ["react", "react-dom"] },
  { name: "React Native", kind: "native", dependencies: ["react-native"] },
  { name: "Expo", kind: "native", dependencies: ["expo"] },
  { name: "Vue", kind: "web", dependencies: ["vue"] },
  { name: "SvelteKit", kind: "web", dependencies: ["@sveltejs/kit"] },
  { name: "Svelte", kind: "web", dependencies: ["svelte"] },
  { name: "Astro", kind: "web", dependencies: ["astro"] },
  { name: "Remix", kind: "web", dependencies: ["@remix-run/react", "@remix-run/node"] },
  { name: "Solid", kind: "web", dependencies: ["solid-js"] },
  { name: "Vite", kind: "web", dependencies: ["vite"] },
  { name: "NestJS", kind: "web", dependencies: ["@nestjs/core"] },
  { name: "Express", kind: "web", dependencies: ["express"] },
  { name: "Fastify", kind: "web", dependencies: ["fastify"] }
];

function dependencyNames(manifest) {
  return Object.keys({
    ...(manifest?.dependencies || {}),
    ...(manifest?.devDependencies || {}),
    ...(manifest?.peerDependencies || {})
  });
}

async function readManifest(handle, name, state) {
  if (state.totalManifestBytes >= MAX_TOTAL_MANIFEST_BYTES) return null;
  try {
    const fileHandle = await handle.getFileHandle(name);
    const file = await fileHandle.getFile();
    if (file.size > MAX_MANIFEST_BYTES) return null;
    const remaining = MAX_TOTAL_MANIFEST_BYTES - state.totalManifestBytes;
    const bytesToRead = Math.min(file.size, remaining);
    const value = await file.slice(0, bytesToRead).text();
    state.totalManifestBytes += bytesToRead;
    return value;
  } catch {
    return null;
  }
}

function detectFromPackageJson(value, evidence) {
  try {
    const manifest = JSON.parse(value);
    const dependencies = new Set(dependencyNames(manifest));
    for (const framework of FRAMEWORKS) {
      const dependency = framework.dependencies.find(item => dependencies.has(item));
      if (dependency) {
        evidence.push("package.json: " + dependency);
        return {
          framework: framework.name,
          applicationType: framework.kind,
          language: "JavaScript/TypeScript"
        };
      }
    }
    if (dependencies.has("typescript")) {
      evidence.push("package.json: typescript");
      return { framework: "TypeScript", applicationType: "web", language: "TypeScript" };
    }
    if (dependencies.size) {
      evidence.push("package.json");
      return { framework: "Node.js", applicationType: "web", language: "JavaScript" };
    }
  } catch {}
  return null;
}

function frameworkFromFileName(name, evidence) {
  const lower = name.toLowerCase();
  if (lower === "pubspec.yaml") { evidence.push(name); return { framework: "Flutter", applicationType: "native", language: "Dart" }; }
  if (lower === "angular.json") { evidence.push(name); return { framework: "Angular", applicationType: "web", language: "TypeScript" }; }
  if (/^vite\.config\./.test(lower)) { evidence.push(name); return { framework: "Vite", applicationType: "web", language: "JavaScript/TypeScript" }; }
  if (/^next\.config\./.test(lower)) { evidence.push(name); return { framework: "Next.js", applicationType: "web", language: "JavaScript/TypeScript" }; }
  if (/^nuxt\.config\./.test(lower)) { evidence.push(name); return { framework: "Nuxt", applicationType: "web", language: "JavaScript/TypeScript" }; }
  if (/^svelte\.config\./.test(lower)) { evidence.push(name); return { framework: "Svelte", applicationType: "web", language: "JavaScript/TypeScript" }; }
  if (/^astro\.config\./.test(lower)) { evidence.push(name); return { framework: "Astro", applicationType: "web", language: "JavaScript/TypeScript" }; }
  if (lower === "androidmanifest.xml" || lower === "build.gradle" || lower === "build.gradle.kts") { evidence.push(name); return { framework: "Android", applicationType: "native", language: "Kotlin/Java" }; }
  if (lower === "cargo.toml") { evidence.push(name); return { framework: "Rust", applicationType: "web", language: "Rust" }; }
  if (lower === "go.mod") { evidence.push(name); return { framework: "Go", applicationType: "web", language: "Go" }; }
  if (lower === "pyproject.toml" || lower === "requirements.txt") { evidence.push(name); return { framework: "Python", applicationType: "web", language: "Python" }; }
  if (lower === "pom.xml") { evidence.push(name); return { framework: "Java", applicationType: "web", language: "Java" }; }
  if (lower === "composer.json") { evidence.push(name); return { framework: "PHP", applicationType: "web", language: "PHP" }; }
  return null;
}

async function scanDirectory(handle, depth, state, evidence, candidates) {
  if (depth > MAX_DEPTH || state.entries >= MAX_ENTRIES) return;
  let entries;
  try { entries = handle.entries(); } catch { return; }
  for await (const [name, entry] of entries) {
    if (state.entries >= MAX_ENTRIES) { state.limited = true; return; }
    state.entries += 1;
    const lower = name.toLowerCase();
    if (entry.kind === "directory") {
      if (!IGNORED_DIRECTORIES.has(lower)) await scanDirectory(entry, depth + 1, state, evidence, candidates);
      continue;
    }
    if (entry.kind !== "file") continue;
    if (lower === "package.json") {
      const value = await readManifest(handle, name, state);
      const result = value && detectFromPackageJson(value, evidence);
      if (result) candidates.push({ depth, result });
      continue;
    }
    const result = frameworkFromFileName(name, evidence);
    if (result) candidates.push({ depth, result });
  }
}

function chooseCandidate(candidates) {
  const priority = {
    "React Native": 100, Expo: 99, Flutter: 98, Android: 97,
    "Next.js": 90, Nuxt: 89, Angular: 88, SvelteKit: 87,
    Astro: 86, Remix: 85, Vue: 84, React: 83, Svelte: 82,
    Solid: 81, Vite: 80
  };
  return [...candidates]
    .sort((a, b) =>
      ((priority[b.result.framework] || 50) - b.depth) -
      ((priority[a.result.framework] || 50) - a.depth)
    )[0]?.result || null;
}

export async function pickProjectFramework() {
  if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
    throw new Error("Folder selection is not supported by this browser.");
  }
  const handle = await window.showDirectoryPicker({ mode: "read" });
  return detectProjectFramework(handle);
}

/**
 * Inspect only the user-selected directory. No parent, sibling, or device-wide traversal occurs.
 */
export async function detectProjectFramework(directoryHandle) {
  if (!directoryHandle || directoryHandle.kind !== "directory") {
    throw new TypeError("A project directory is required.");
  }
  const state = { entries: 0, totalManifestBytes: 0, limited: false };
  const evidence = [];
  const candidates = [];
  await scanDirectory(directoryHandle, 0, state, evidence, candidates);
  const detected = chooseCandidate(candidates);
  return {
    framework: detected?.framework || null,
    applicationType: detected?.applicationType || "web",
    language: detected?.language || null,
    evidence: [...new Set(evidence)].slice(0, 8),
    scannedEntries: state.entries,
    limited: state.limited
  };
}
