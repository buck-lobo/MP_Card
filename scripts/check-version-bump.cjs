const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function safeRun(cmd) {
  try {
    return { ok: true, out: run(cmd) };
  } catch (err) {
    return { ok: false, out: "", err };
  }
}

function die(msg) {
  process.stderr.write(`\n${msg}\n`);
  process.exit(1);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonFromGit(ref, filePathPosix) {
  const { ok, out, err } = safeRun(`git show ${ref}:${filePathPosix}`);
  if (!ok) {
    throw err;
  }
  return JSON.parse(out);
}

function normalizePaths(list) {
  return list
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
}

function filterChanged(changed, ignorePrefixes) {
  return changed.filter((p) => !ignorePrefixes.some((prefix) => p.startsWith(prefix)));
}

function parseGitStatusPorcelain(output) {
  // Format examples:
  //  M path
  // M  path
  // ?? path
  // R  old -> new
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      // line starts with XY then space
      const rest = line.length >= 3 ? line.slice(3).trim() : "";
      const arrowIdx = rest.indexOf(" -> ");
      const p = arrowIdx >= 0 ? rest.slice(arrowIdx + 4).trim() : rest;
      return p.replace(/\\/g, "/");
    })
    .filter(Boolean);
}

function main() {
  const gitTop = safeRun("git rev-parse --show-toplevel");
  if (!gitTop.ok) {
    die(
      "Version gate: este comando precisa rodar dentro de um repositório git (git rev-parse falhou)."
    );
  }

  const repoRoot = gitTop.out;
  process.chdir(repoRoot);

  const head = safeRun("git rev-parse HEAD");
  if (!head.ok || !head.out) {
    die("Version gate: não consegui determinar o commit atual (HEAD).");
  }

  const status = safeRun("git status --porcelain");
  if (!status.ok) {
    die("Version gate: falha ao executar git status para validar bump de versão.");
  }

  const statusPaths = parseGitStatusPorcelain(status.out);
  const adminChanged = filterChanged(
    statusPaths.filter((p) => p.startsWith("admin-webapp/")),
    ["admin-webapp/dist/", "admin-webapp/node_modules/"]
  );

  const functionsChanged = filterChanged(
    statusPaths.filter((p) => p.startsWith("functions/")),
    ["functions/lib2/", "functions/node_modules/"]
  );

  const checks = [
    {
      name: "admin-webapp",
      changed: adminChanged,
      packagePath: "admin-webapp/package.json",
    },
    {
      name: "functions",
      changed: functionsChanged,
      packagePath: "functions/package.json",
    },
  ];

  for (const check of checks) {
    if (check.changed.length === 0) {
      continue;
    }

    const pkgPathFs = path.join(repoRoot, check.packagePath);
    const pkgPosix = check.packagePath;

    const current = readJsonFile(pkgPathFs);
    const prevPkg = readJsonFromGit(head.out, pkgPosix);

    const currentVersion = String(current.version || "").trim();
    const prevVersion = String(prevPkg.version || "").trim();

    if (!currentVersion) {
      die(
        `Version gate: ${check.packagePath} não contém uma versão válida (campo version vazio).`
      );
    }

    if (currentVersion === prevVersion) {
      const changedPreview = check.changed.slice(0, 8).join("\n- ");
      die(
        `Version gate: mudanças detectadas em '${check.name}', mas a versão não foi incrementada.\n\n` +
          `- Versão anterior: ${prevVersion}\n` +
          `- Versão atual:     ${currentVersion}\n\n` +
          `Arquivos alterados (amostra):\n- ${changedPreview}\n\n` +
          `Ajuste a versão em ${check.packagePath} (ex: patch/minor), faça commit e tente o deploy novamente.`
      );
    }
  }
}

main();
