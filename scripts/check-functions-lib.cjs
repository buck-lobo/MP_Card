const fs = require("fs");
const path = require("path");

function die(msg) {
  process.stderr.write(`\n${msg}\n`);
  process.exit(1);
}

function main() {
  // This script is intended to be run from functions/ as the working directory
  // via: npm --prefix functions run build
  const cwd = process.cwd();
  const libIndex = path.resolve(cwd, "lib", "index.js");

  if (!fs.existsSync(libIndex)) {
    die(
      "Functions build check failed: 'functions/lib/index.js' não foi encontrado.\n" +
        "O Firebase executa 'functions/lib/index.js' (main).\n" +
        "Garanta que o diretório 'functions/lib/' esteja versionado no git e presente antes do deploy."
    );
  }

  const content = fs.readFileSync(libIndex, "utf8");
  if (!content.includes("exports.userRequestAccess")) {
    die(
      "Functions build check failed: endpoint 'userRequestAccess' não encontrado em functions/lib/index.js.\n" +
        "Se você acabou de implementar a solicitação de acesso, confirme que o arquivo lib/index.js está atualizado e commitado."
    );
  }
}

main();
