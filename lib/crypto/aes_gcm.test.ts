/**
 * A DECIFRAGEM RECUSA SOZINHA O FORMATO QUE A CIFRAGEM NUNCA PRODUZ (issue #41).
 *
 * No GCM, a etiqueta de autenticação prova que o cifrado não foi adulterado. O
 * Node, sem `authTagLength` declarado, aceita etiqueta de 4, 8 ou 12 bytes — e
 * os primeiros 4 bytes da etiqueta CERTA autenticam. Etiqueta curta é muito
 * mais fácil de forjar por tentativa: quem gravasse nas colunas `bytea` trocaria
 * um segredo por um forjado e o sistema o aceitaria como legítimo.
 *
 * Tudo aqui passa só pela porta pública (`encryptKey` → mexer no que sai →
 * `decryptKey`). Os chamadores não ganham teste: eles já tratam o erro.
 */
import { describe, expect, it, vi } from "vitest";

// Precisa existir ANTES do import: `lib/env.ts` lê o processo no carregamento
// do módulo, e é ele que entrega a chave de cifragem ao AES.
vi.hoisted(() => {
  // base64 de "chave-de-teste-nao-e-de-producao" (32 bytes): falsa à vista.
  process.env.AI_CRED_AES_KEY = "Y2hhdmUtZGUtdGVzdGUtbmFvLWUtZGUtcHJvZHVjYW8=";
});

import { decryptKey, encryptKey } from "@/lib/crypto/aes_gcm";

const SEGREDO = "sk-ant-api03-coração-🔐-ÁÉÍÓÚ-çã";

/** O erro que `decryptKey` lança, ou falha o teste se ela não lançar. */
function recusa(input: Parameters<typeof decryptKey>[0]): Error {
  try {
    const texto = decryptKey(input);
    throw new Error(`decifrou o que devia recusar (${texto.length} chars)`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("decifrou o que devia recusar")) throw e;
    return e as Error;
  }
}

/** Nada do segredo, da etiqueta nem do IV — em claro, hex ou base64. */
function semMaterial(erro: Error, s: ReturnType<typeof encryptKey>, extras: Buffer[] = []) {
  const proibidos = [SEGREDO, s.last4];
  for (const b of [s.tag, s.iv, s.ciphertext, ...extras]) {
    proibidos.push(b.toString("hex"), b.toString("base64"));
  }
  for (const p of proibidos) expect(erro.message).not.toContain(p);
}

describe("cifrar → decifrar", () => {
  it("volta idêntico, com acentos e emoji (controle positivo)", () => {
    const s = encryptKey(SEGREDO);
    expect(s.iv).toHaveLength(12);
    expect(s.tag).toHaveLength(16);
    expect(decryptKey(s)).toBe(SEGREDO);
  });
});

describe("a etiqueta tem de ter exatamente 16 bytes", () => {
  it.each([4, 8, 12])("etiqueta truncada para %i bytes é recusada", (n) => {
    const s = encryptKey(SEGREDO);
    const tag = s.tag.subarray(0, n);
    const erro = recusa({ ...s, tag });
    expect(erro.message).toMatch(/etiqueta/i);
    expect(erro.message).toContain("16");
    semMaterial(erro, s);
  });

  it("etiqueta com mais de 16 bytes é recusada", () => {
    const s = encryptKey(SEGREDO);
    const tag = Buffer.concat([s.tag, Buffer.from([0])]);
    const erro = recusa({ ...s, tag });
    expect(erro.message).toMatch(/etiqueta/i);
    semMaterial(erro, s, [tag]);
  });

  it("etiqueta de 16 bytes com um byte trocado continua recusada (a autenticação segue ativa)", () => {
    const s = encryptKey(SEGREDO);
    const tag = Buffer.from(s.tag);
    tag[0] = tag[0]! ^ 0xff;
    const erro = recusa({ ...s, tag });
    semMaterial(erro, s, [tag]);
  });
});

describe("o IV tem de ter exatamente 12 bytes", () => {
  it.each([8, 16])("IV de %i bytes é recusado", (n) => {
    const s = encryptKey(SEGREDO);
    const iv = Buffer.alloc(n, 7);
    s.iv.copy(iv);
    const erro = recusa({ ...s, iv });
    expect(erro.message).toMatch(/\bIV\b/);
    expect(erro.message).toContain("12");
    semMaterial(erro, s, [iv]);
  });
});
