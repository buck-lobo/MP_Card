#!/usr/bin/env node

const { execFileSync } = require("node:child_process");

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    return null;
  }
}

function parseSemver(version) {
  if (typeof version !== "string") return null;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}

function refExists(ref) {
  return Boolean(runGit(["rev-parse", "--verify", ref]));
}

function findRemoteDefaultBranch() {
  const originHead = runGit(["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (originHead && originHead.startsWith("refs/remotes/")) {
    return originHead.replace("refs/remotes/", "");
  }
  return null;
}

function getBaseRef() {
  const mergeBase = runGit(["merge-base", "HEAD", "@{u}"]);
  if (mergeBase) return mergeBase;

  const remoteDefault = findRemoteDefaultBranch();
  if (remoteDefault && refExists(remoteDefault)) {
    const remoteDefaultBase = runGit(["merge-base", "HEAD", remoteDefault]);
    if (remoteDefaultBase) return remoteDefaultBase;
  }

  const remoteCandidates = ["origin/main", "origin/master"];
  for (const candidate of remoteCandidates) {
    if (!refExists(candidate)) {
      continue;
    }
    const candidateBase = runGit(["merge-base", "HEAD", candidate]);
    if (candidateBase) {
      return candidateBase;
    }
  }

  const previousHead = runGit(["rev-parse", "--verify", "HEAD~1"]);
  if (previousHead) return previousHead;

  return null;
}

function getChangedFiles(baseRef) {
  if (!baseRef) return [];
  const output = runGit(["diff", "--name-only", `${baseRef}..HEAD`]);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function isSystemChange(filePath) {
  if (!filePath) return false;

  if (
    filePath.startsWith("admin-webapp/") ||
    filePath.startsWith("functions/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith(".husky/")
  ) {
    return true;
  }

  const rootSystemFiles = new Set([
    "bot.py",
    "config.py",
    "firebase.json",
    "requirements.txt",
    "package.json",
    "package-lock.json",
  ]);

  return rootSystemFiles.has(filePath);
}

function getJsonAtRef(ref, filePath) {
  const content = runGit(["show", `${ref}:${filePath}`]);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getVersionPair(baseRef) {
  const candidates = ["package.json", "functions/package.json"];

  for (const filePath of candidates) {
    const previousPkg = getJsonAtRef(baseRef, filePath);
    const currentPkg = getJsonAtRef("HEAD", filePath);

    if (previousPkg?.version && currentPkg?.version) {
      return {
        filePath,
        previousVersion: previousPkg.version,
        currentVersion: currentPkg.version,
      };
    }
  }

  return null;
}

function fail(message) {
  process.stderr.write(`\n❌ ${message}\n\n`);
  process.exit(1);
}

function main() {
  const isRepo = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (isRepo !== "true") {
    process.exit(0);
  }

  const baseRef = getBaseRef();
  if (!baseRef) {
    process.exit(0);
  }

  const changedFiles = getChangedFiles(baseRef);
  if (changedFiles.length === 0) {
    process.exit(0);
  }

  const hasSystemChanges = changedFiles.some(isSystemChange);
  if (!hasSystemChanges) {
    process.exit(0);
  }

  const changelogChanged = changedFiles.includes("CHANGELOG.md");
  if (!changelogChanged) {
    fail(
      "Foram detectadas alterações no sistema, mas o arquivo CHANGELOG.md não foi atualizado."
    );
  }

  const versionPair = getVersionPair(baseRef);
  if (!versionPair) {
    fail(
      "Não foi possível validar versão (arquivos tentados: package.json e functions/package.json)."
    );
  }

  const { filePath, previousVersion, currentVersion } = versionPair;

  if (compareSemver(currentVersion, previousVersion) <= 0) {
    fail(
      `A versão do sistema não foi incrementada em ${filePath} (atual: ${currentVersion}, base: ${previousVersion}).`
    );
  }

  process.stdout.write(
    `✅ Validação de release ok: changelog atualizado e versão incrementada (${previousVersion} -> ${currentVersion}).\n`
  );
}

main();
