"use strict";

const crypto = require("node:crypto");
const { parse, validate } = require("@tma.js/init-data-node");

function parseAndVerifyInitData(initData, botToken) {
    if (!initData) {
        throw new Error("initData vazio");
    }
    if (!botToken) {
        throw new Error("Bot token vazio");
    }

    let normalizedInitData = String(initData || "").trim();
    if (normalizedInitData.startsWith("?")) {
        normalizedInitData = normalizedInitData.slice(1);
    }

    const hashFragmentIndex = normalizedInitData.indexOf("#");
    if (hashFragmentIndex >= 0) {
        normalizedInitData = normalizedInitData.slice(0, hashFragmentIndex);
    }

    const primaryExpiresInSec = 60 * 60 * 24 * 30;
    const fallbackExpiresInSec = 60 * 60 * 24 * 365;

    try {
        validate(normalizedInitData, botToken, {
            expiresIn: primaryExpiresInSec,
        });
    } catch (error_) {
        try {
            validate(normalizedInitData, botToken, {
                expiresIn: fallbackExpiresInSec,
            });
            console.warn("initData aceito via janela estendida de expiração", {
                primaryExpiresInSec,
                fallbackExpiresInSec,
            });
        } catch {
        try {
            const params = new URLSearchParams(normalizedInitData);
            const keys = Array.from(params.keys()).filter((key) => key !== "hash").sort();
            const hash = params.get("hash") || "";
            const tokenSanitized = String(botToken || "").trim().replaceAll(" ", "");
            const botIdPrefix = tokenSanitized.split(":")[0] || null;
            const tokenFingerprint = crypto
                .createHash("sha256")
                .update(tokenSanitized)
                .digest("hex")
                .slice(0, 8);

            console.warn("initData inválido (metadados):", {
                initDataLength: String(normalizedInitData || "").length,
                hashLength: String(hash || "").length,
                hashIsHex64: /^[0-9a-f]{64}$/i.test(String(hash || "")),
                decodedKeys: keys,
                botIdPrefix,
                tokenFingerprint,
                errorName: error_ && typeof error_ === "object" ? error_.name : null,
            });
        } catch {
        }

        throw new TypeError("Assinatura de initData inválida");
        }
    }

    const parsed = parse(normalizedInitData);
    const user = parsed?.user;
    if (typeof user?.id !== "number") {
        throw new TypeError("User.id invalido em initData");
    }

    return user;
}

exports.parseAndVerifyInitData = parseAndVerifyInitData;
//# sourceMappingURL=webappAuth.js.map