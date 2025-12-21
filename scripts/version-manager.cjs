#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
        current.localeCompare(max, undefined, { numeric: true }) > 0 ? current : max, 
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
          execSync(`git add ${pkg.jsonPath} ${pkg.lockPath}`, { stdio: 'inherit' });
        }
        
        updated = true;
      }
    });
    
    return updated;
  }

  checkVersionBump() {
    if (!this.isPredeploy) return true;
    
    try {
      const currentVersion = this.packages[0].data.version;
      const lastVersion = execSync('git show HEAD:package.json 2>/dev/null || echo "{}"')
        .toString()
        .trim();
      
      const lastVersionJson = JSON.parse(lastVersion || '{}');
      
      if (lastVersionJson.version === currentVersion) {
        console.error('Erro: A versão não foi incrementada. Atualize a versão no package.json');
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
