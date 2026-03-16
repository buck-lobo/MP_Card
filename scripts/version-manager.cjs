#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Configurações
const PACKAGE_PATHS = [
  '.',                 // Raiz do projeto
  'admin-webapp',     // Aplicação web admin
  'functions'         // Funções Firebase
];

// Utilitários
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function tryExecGit(args) {
  try {
    const out = execFileSync('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    return { ok: true, stdout: out };
  } catch (err) {
    const stderr = (err && err.stderr) ? String(err.stderr) : '';
    const stdout = (err && err.stdout) ? String(err.stdout) : '';
    return { ok: false, stdout, stderr, err };
  }
}

function isInsideGitRepo() {
  const res = tryExecGit(['rev-parse', '--is-inside-work-tree']);
  return res.ok && String(res.stdout || '').trim() === 'true';
}

function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
  }
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}

function hasDeployRelevantChanges() {
  // Só exige bump quando houver mudanças no que vai para o deploy (functions/hosting/scripts/firebase.json)
  if (!isInsideGitRepo()) return true;

  const res = tryExecGit(['diff', '--name-only', 'HEAD']);
  if (!res.ok) {
    // Ex.: primeiro commit (sem HEAD) ou git indisponível.
    return true;
  }
  const files = String(res.stdout || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const relevantPrefixes = [
    'functions/',
    'admin-webapp/',
    'scripts/',
  ];
  const relevantFiles = new Set([
    'firebase.json',
    'package.json',
    'package-lock.json',
    'functions/package.json',
    'functions/package-lock.json',
    'admin-webapp/package.json',
    'admin-webapp/package-lock.json',
  ]);

  return files.some(f => relevantFiles.has(f) || relevantPrefixes.some(p => f.startsWith(p)));
}

function getPackageInfo(packagePath) {
  const packageJsonPath = path.join(process.cwd(), packagePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  
  return {
    path: packagePath,
    jsonPath: packageJsonPath,
    data: readJsonFile(packageJsonPath),
    lockPath: path.join(process.cwd(), packagePath, 'package-lock.json'),
    hasLock: fs.existsSync(path.join(process.cwd(), packagePath, 'package-lock.json'))
  };
}

// Lógica principal
class VersionManager {
  constructor() {
    this.packages = PACKAGE_PATHS
      .map(getPackageInfo)
      .filter(pkg => pkg !== null);
    
    this.isPreCommit = process.argv.includes('--pre-commit');
    this.isPredeploy = process.argv.includes('--predeploy');
  }

  getMaxVersion() {
    return this.packages
      .map(pkg => pkg.data.version || '0.0.0')
      .reduce((max, current) => 
        compareSemver(current, max) > 0 ? current : max, 
        '0.0.0'
      );
  }

  updatePackageVersions(version) {
    let updated = false;
    
    this.packages.forEach(pkg => {
      if (pkg.data.version !== version) {
        console.log(`Atualizando ${pkg.path}/package.json para v${version}`);
        pkg.data.version = version;
        writeJsonFile(pkg.jsonPath, pkg.data);
        
        if (pkg.hasLock) {
          const lockData = readJsonFile(pkg.lockPath);
          if (lockData.version !== version) {
            lockData.version = version;
            writeJsonFile(pkg.lockPath, lockData);
          }
        }
        
        if (this.isPreCommit) {
          const toAdd = [pkg.jsonPath];
          if (pkg.hasLock) {
            toAdd.push(pkg.lockPath);
          }
          const existing = toAdd.filter(p => fs.existsSync(p));
          if (existing.length > 0) {
            execFileSync('git', ['add', ...existing], { stdio: 'inherit' });
          }
        }
        
        updated = true;
      }
    });
    
    return updated;
  }

  checkVersionBump() {
    if (!this.isPredeploy) return true;

    if (!isInsideGitRepo()) {
      console.warn('Aviso: repositório git não detectado; pulando verificação de incremento de versão.');
      return true;
    }

     if (!hasDeployRelevantChanges()) {
      console.log('Sem mudanças relevantes para deploy; verificação de bump de versão não é necessária.');
      return true;
    }
    
    try {
      const currentVersion = this.packages[0].data.version;
      const res = tryExecGit(['show', 'HEAD:package.json']);
      const lastVersionRaw = (res.ok ? res.stdout : '{}').trim();
      const lastVersionJson = JSON.parse(lastVersionRaw || '{}');

      if (!lastVersionJson.version) {
        console.warn('Aviso: não foi possível ler a versão anterior do HEAD; permitindo deploy.');
        return true;
      }

      if (compareSemver(currentVersion, lastVersionJson.version) <= 0) {
        console.error(`Erro: A versão não foi incrementada. Atualize a versão no package.json (atual: ${currentVersion}, HEAD: ${lastVersionJson.version})`);
        return false;
      }
      
      console.log(`Versão incrementada de ${lastVersionJson.version} para ${currentVersion}`);
      return true;
    } catch (error) {
      console.error('Erro ao verificar versão:', error.message);
      return false;
    }
  }

  run() {
    const maxVersion = this.getMaxVersion();
    
    if (this.isPredeploy && !this.checkVersionBump()) {
      process.exit(1);
    }
    
    const updated = this.updatePackageVersions(maxVersion);
    
    if (updated && this.isPreCommit) {
      console.log('\n⚠️  As versões dos pacotes foram sincronizadas. Por favor, faça o commit novamente.');
      process.exit(1);
    }
    
    console.log('✅ Todas as versões estão sincronizadas!');
  }
}

// Execução
const manager = new VersionManager();
manager.run();
