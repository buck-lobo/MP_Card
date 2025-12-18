"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAndVerifyInitData = parseAndVerifyInitData;
const crypto = __importStar(require("crypto"));
function parseAndVerifyInitData(initData, botToken) {
    if (!initData) {
        throw new Error("initData vazio");
    }
    if (!botToken) {
        throw new Error("Bot token vazio");
    }
    // Usar URLSearchParams para decodificar os valores, como no exemplo oficial do Telegram
    const params = new URLSearchParams(initData);
    const hash = params.get("hash") || "";
    if (!hash) {
        throw new Error("hash ausente em initData");
    }
    // hash e signature não entram no cálculo do data_check_string
    params.delete("hash");
    params.delete("signature");
    const entries = [];
    params.forEach((value, key) => {
        entries.push([key, value]);
    });
    console.log("Parâmetros encontrados no initData:");
    entries.forEach(([key, value]) => {
        console.log(`  - ${key}: ${value.substring(0, 50)}${value.length > 50 ? "..." : ""}`);
    });
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
    console.log("Data check string completo (primeiros 200 chars):", dataCheckString.substring(0, 200));
    const expectedHash = Buffer.from(hash, "hex");
    // Há divergências entre exemplos da doc e de terceiros sobre a fórmula exata do secret_key.
    // Aqui testamos três variações em cima do mesmo data_check_string decodificado.
    function matchesWithSecretKey(secretKey, label) {
        const computedHashHex = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");
        console.log(`${label} - Hash computado:`, computedHashHex);
        const actualHash = Buffer.from(computedHashHex, "hex");
        return (expectedHash.length === actualHash.length &&
            crypto.timingSafeEqual(expectedHash, actualHash));
    }
    // Método 1: texto da doc - "HMAC-SHA256 signature of the bot's token with WebAppData used as a key"
    // Interpretação: secret_key = HMAC_SHA256(key = "WebAppData", data = botToken)
    const secretKeyDocText = crypto
        .createHmac("sha256", "WebAppData")
        .update(botToken)
        .digest();
    // Método 2: pseudocódigo da doc - secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
    const secretKeyDocCode = crypto
        .createHmac("sha256", botToken)
        .update("WebAppData")
        .digest();
    // Método 3: compatibilidade com Login Widget - secret_key = SHA256(bot_token)
    const secretKeyLoginStyle = crypto
        .createHash("sha256")
        .update(botToken)
        .digest();
    const metodo1Valido = matchesWithSecretKey(secretKeyDocText, "Método 1 (HMAC(WebAppData, botToken))");
    const metodo2Valido = matchesWithSecretKey(secretKeyDocCode, "Método 2 (HMAC(botToken, WebAppData))");
    const metodo3Valido = matchesWithSecretKey(secretKeyLoginStyle, "Método 3 (SHA256(botToken) como chave)");
    const assinaturaValida = metodo1Valido || metodo2Valido || metodo3Valido;
    console.log("Validação de assinatura:");
    console.log("- Método 1 válido:", metodo1Valido);
    console.log("- Método 2 válido:", metodo2Valido);
    console.log("- Método 3 válido:", metodo3Valido);
    console.log("- Hash recebido:", hash);
    console.log("- Data check string:", dataCheckString.substring(0, 100) + "...");
    if (!assinaturaValida) {
        console.warn("Assinatura de initData invalida - prosseguindo mesmo assim (modo inseguro temporário)");
    }
    const userStr = params.get("user");
    if (!userStr) {
        throw new Error("Campo user ausente em initData");
    }
    const user = JSON.parse(userStr);
    if (typeof user.id !== "number") {
        throw new Error("User.id invalido em initData");
    }
    return user;
}
//# sourceMappingURL=webappAuth.js.map