import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { ehUrlAssinadaDoProprioStorage } from "@/lib/messaging/media/url-de-midia-externa";

describe("ehUrlAssinadaDoProprioStorage", () => {
  it("reconhece a URL assinada pelo Storage desta instalação", () => {
    expect(
      ehUrlAssinadaDoProprioStorage(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/propostas/o/p.pdf?token=t`),
    ).toBe(true);
  });

  it.each([
    // Parece Storage, mas não é a origem DESTA instalação: não herda a exceção.
    ["Storage de outra origem", "http://127.0.0.1:54321/storage/v1/object/sign/x?token=t"],
    ["metadata da nuvem", "http://169.254.169.254/latest/meta-data/"],
    ["a API REST da própria instalação (não é rota de assinatura)", `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/messages`],
    ["tentativa de subir pelo `..` até a REST", `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/../../rest/v1/messages`],
    ["lixo", "não é url"],
  ])("não reconhece %s", (_nome, url) => {
    expect(ehUrlAssinadaDoProprioStorage(url)).toBe(false);
  });
});
