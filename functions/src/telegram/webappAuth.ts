import * as crypto from "node:crypto";
import { parse, validate } from "@tma.js/init-data-node";

export type WebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function parseAndVerifyInitData(
  initData: string,
  botToken: string,
): WebAppUser {
  if (!initData) {
    throw new Error("initData vazio");
  }
  if (!botToken) {
    throw new Error("Bot token vazio");
  }

  // Normalizar formatos comuns (ex: initData começando com '?' ou contendo fragment '#')
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
  } catch (err: unknown) {
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
        const keys = Array.from(params.keys())
          .filter((k) => k !== "hash")
          .sort((a, b) => a.localeCompare(b));
        const hash = params.get("hash") || "";

        const tokenSanitized = String(botToken || "").replace(/[\n\r\t ]/g, "");
        const botIdPrefix = tokenSanitized.split(":")[0] || null;
        const tokenFingerprint = crypto
          .createHash("sha256")
          .update(tokenSanitized)
          .digest("hex")
          .slice(0, 8);

        // eslint-disable-next-line no-console
        console.warn("initData inválido (metadados):", {
          initDataLength: String(normalizedInitData || "").length,
          hashLength: String(hash || "").length,
          hashIsHex64: /^[0-9a-f]{64}$/i.test(String(hash || "")),
          decodedKeys: keys,
          botIdPrefix,
          tokenFingerprint,
          errorName:
            err && typeof err === "object" && "name" in err
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                String((err as any).name)
              : null,
        });
      } catch {
        // ignore
      }
      throw new Error("Assinatura de initData inválida");
    }
  }

  const parsed = parse(normalizedInitData) as { user?: WebAppUser };
  const user = parsed?.user;
  if (!user) {
    throw new Error("Campo user ausente em initData");
  }
  if (typeof user.id !== "number") {
    throw new TypeError("User.id invalido em initData");
  }

  return user;
}
