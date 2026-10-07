/**
 * AES-256-GCM helpers para `ai_provider_credentials`.
 *
 * Key source: `process.env.AI_CRED_AES_KEY` — 32 bytes em base64.
 * Output do `encryptKey`: três `Buffer`s separados (ciphertext, IV de 12 bytes,
 * tag de 16 bytes) que são gravados como `bytea` na tabela. Pra uso via PostgREST
 * use o helper `bufToBytea()` que produz a literal `\x<hex>`.
 *
 * Plaintext NUNCA deve ser logado, persistido ou retornado em response — apenas
 * o `last4` é exposto via view `ai_provider_credentials_safe`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const TAG_LENGTH_BYTES = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.AI_CRED_AES_KEY;
  if (!raw) {
    throw new Error(
      "AI_CRED_AES_KEY não configurada. Defina em .env.local (32 bytes base64).",
    );
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error("AI_CRED_AES_KEY inválida: base64 malformado.");
  }
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `AI_CRED_AES_KEY deve ter exatamente 32 bytes (lido: ${buf.length}). Gere com: openssl rand -base64 32`,
    );
  }
  cachedKey = buf;
  return buf;
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** Últimos 4 chars do plaintext, mostrados na UI pra identificação. */
  last4: string;
}

export function encryptKey(plaintext: string): EncryptedSecret {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("plaintext inválido pra encryptKey()");
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH_BYTES) {
    throw new Error(`tag length inesperada: ${tag.length}`);
  }
  const last4 = plaintext.slice(-4);
  return { ciphertext, iv, tag, last4 };
}

/**
 * Recusa, antes de qualquer operação criptográfica, etiqueta que não tenha 16
 * bytes e IV que não tenha 12 — o único formato que `encryptKey` produz.
 *
 * Sem isto o Node aceita etiqueta de 4, 8 ou 12 bytes, e o prefixo da etiqueta
 * certa autentica: forjar um segredo por tentativa contra 4 bytes é barato
 * (issue #41). O `authTagLength` no decifrador é a segunda camada; esta
 * conferência existe para a mensagem e para não depender de versão do Node.
 *
 * A mensagem cita só o campo e os TAMANHOS, nunca conteúdo: um chamador a
 * repassa para dentro do erro de credencial indisponível.
 */
export function decryptKey(input: {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}): string {
  const { ciphertext, iv, tag } = input;
  if (tag.length !== TAG_LENGTH_BYTES) {
    throw new Error(
      `etiqueta de autenticação com ${tag.length} bytes (esperado: ${TAG_LENGTH_BYTES})`,
    );
  }
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`IV com ${iv.length} bytes (esperado: ${IV_LENGTH_BYTES})`);
  }
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_LENGTH_BYTES,
  });
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Converte um Buffer em literal hex aceito pelo PostgREST pra colunas `bytea`.
 */
export function bufToBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/**
 * Inverso de `bufToBytea`: aceita o que o PostgREST devolve em colunas bytea
 * (string `\xHEX` em modo padrão, ou Buffer/Uint8Array dependendo do driver).
 */
export function byteaToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    return Buffer.from(hex, "hex");
  }
  throw new Error("byteaToBuffer: formato inesperado");
}
