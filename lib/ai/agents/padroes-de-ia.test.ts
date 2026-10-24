import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { funilPadraoDaOrg, resolverPadroesDeIa } from "./padroes-de-ia";

type Resposta = { data: unknown; error: { message: string } | null };

/**
 * Um admin falso: cada tabela tem uma fila de respostas, consumida na ordem em que
 * as consultas são feitas. Todo método de filtro devolve o próprio construtor, e
 * `await` ou `maybeSingle()` tiram a próxima resposta da fila daquela tabela.
 */
function adminFalso(filas: Record<string, Resposta[]>): SupabaseClient {
  const proxima = (tabela: string): Resposta => {
    const fila = filas[tabela] ?? [];
    return fila.shift() ?? { data: null, error: null };
  };
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "is", "order", "limit"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve(proxima(tabela));
    b.then = (ok: (v: Resposta) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(proxima(tabela)).then(ok, ko);
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const ok = (data: unknown): Resposta => ({ data, error: null });
const MODELO = { model_id: "claude-modelo", is_default_for_provider: true, supports_tools: true };

afterEach(() => vi.unstubAllEnvs());

describe("resolverPadroesDeIa", () => {
  it("usa a credencial validada da organização", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const admin = adminFalso({
      organizations: [ok({ settings: { llm: { provider: "anthropic" } } })],
      ai_provider_credentials: [ok({ id: "cred-1" })],
      ai_models: [ok([MODELO])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toEqual({
      ok: true,
      provider: "anthropic",
      model: "claude-modelo",
      credentialId: "cred-1",
    });
  });

  it("sem credencial mas com chave da instalação, usa a chave da instalação (credentialId nulo)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste");
    const admin = adminFalso({
      organizations: [ok({ settings: { llm: { provider: "openai" } } })],
      ai_provider_credentials: [ok(null)],
      ai_models: [ok([MODELO])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toMatchObject({
      ok: true,
      provider: "openai",
      credentialId: null,
    });
  });

  it("sem nenhuma chave diz sem_chave e nomeia o provedor", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const admin = adminFalso({
      organizations: [ok({ settings: {} })],
      ai_provider_credentials: [ok(null), ok(null)],
      ai_models: [ok([MODELO])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toEqual({
      ok: false,
      motivo: "sem_chave",
      provider: "anthropic",
      chaveEmVerificacao: false,
    });
  });

  it("chave colada e ainda não confirmada pelo provedor vira chaveEmVerificacao", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const admin = adminFalso({
      organizations: [ok({ settings: { llm: { provider: "anthropic" } } })],
      ai_provider_credentials: [ok(null), ok({ provider: "anthropic" })],
      ai_models: [ok([MODELO])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toMatchObject({
      ok: false,
      motivo: "sem_chave",
      chaveEmVerificacao: true,
    });
  });

  it("catálogo de modelos vazio diz sem_modelo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-teste");
    const admin = adminFalso({
      organizations: [ok({ settings: {} })],
      ai_models: [ok([])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toMatchObject({
      ok: false,
      motivo: "sem_modelo",
    });
  });

  it("provedor desconhecido nas configurações cai em anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-teste");
    const admin = adminFalso({
      organizations: [ok({ settings: { llm: { provider: "inexistente" } } })],
      ai_provider_credentials: [ok(null)],
      ai_models: [ok([MODELO])],
    });
    expect(await resolverPadroesDeIa(admin, "org")).toMatchObject({
      ok: true,
      provider: "anthropic",
    });
  });

  it("erro de banco não lança: devolve ok:false", async () => {
    const admin = adminFalso({ organizations: [{ data: null, error: { message: "boom" } }] });
    const r = await resolverPadroesDeIa(admin, "org");
    expect(r.ok).toBe(false);
  });
});

describe("funilPadraoDaOrg", () => {
  it("devolve o id do funil padrão não arquivado, ou null", async () => {
    expect(await funilPadraoDaOrg(adminFalso({ crm_pipelines: [ok({ id: "f1" })] }), "org")).toBe(
      "f1",
    );
    expect(await funilPadraoDaOrg(adminFalso({ crm_pipelines: [ok(null)] }), "org")).toBeNull();
    expect(
      await funilPadraoDaOrg(
        adminFalso({ crm_pipelines: [{ data: null, error: { message: "x" } }] }),
        "org",
      ),
    ).toBeNull();
  });
});
