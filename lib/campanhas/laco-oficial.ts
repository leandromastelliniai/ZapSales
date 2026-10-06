/**
 * O LAÇO CONTÍNUO da campanha oficial (issue #8), no processo `worker`.
 *
 * A spec pede worker contínuo sobre a fila do Postgres: o cron de um minuto
 * daria, no melhor caso, um lote por minuto por campanha, e a API Oficial
 * aguenta muito mais. Aqui a rodada roda de novo em poucos segundos enquanto há
 * trabalho, e espaça quando não há. O cron `campaign-worker` continua como rede
 * de segurança (worker fora do ar não pode parar campanha), e os dois rodam
 * juntos sem disputar destinatário: a reserva é `FOR UPDATE SKIP LOCKED`.
 *
 * ─── Por que os imports são dinâmicos ───────────────────────────────────────
 *
 * Mesma lei do laço do event_log (`lib/event-log/drain-loop.ts`): a cadeia da
 * rodada termina em `@/lib/env`, que lança no topo do módulo quando falta
 * variável. Importada estaticamente, um `.env` enxuto derrubaria o WORKER
 * INTEIRO no boot por causa de um laço acessório. Aqui o laço se desliga, avisa
 * no log, e o resto do worker sobe — a campanha segue pelo cron.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Logger } from "@/lib/agent-engine/obs/logger";

import { rodadaOficialMexeu, resumoDaRodadaOficial, type ResultadoDaRodadaOficial } from "./rodada-oficial";

export interface KnobsDoLacoOficial {
  /** Espera entre rodadas que FIZERAM algo. */
  intervaloMs: number;
  /** Espera entre rodadas ociosas — sem campanha oficial rodando é o caso comum. */
  ociosoMs: number;
}

export const KNOBS_DO_LACO_OFICIAL: KnobsDoLacoOficial = { intervaloMs: 2_000, ociosoMs: 15_000 };

export interface DepsDoLacoOficial {
  admin: SupabaseClient;
  rodar: (admin: SupabaseClient, agora?: Date) => Promise<ResultadoDaRodadaOficial>;
  /**
   * Rodada que MEXEU em campanha audita, como a do cron (regra do `CLAUDE.md`:
   * a que não fez nada não audita; a que fez, audita). Mesma ação, com a
   * origem marcada — quem lê o log sabe se foi o cron ou o worker.
   */
  auditar: (r: ResultadoDaRodadaOficial) => Promise<void>;
}

async function carregarDeps(): Promise<DepsDoLacoOficial> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { rodarUmaRodadaOficial } = await import("./rodada-oficial");
  const { audit } = await import("@/lib/audit");
  return {
    admin: createAdminClient(),
    rodar: rodarUmaRodadaOficial,
    auditar: (r) =>
      audit({
        action: "cron.campaign_worker",
        bypassedRls: true,
        metadata: { origem: "worker", oficial: resumoDaRodadaOficial(r) },
      }),
  };
}

/** Nunca lança: termina quando o `signal` aborta ou quando as dependências não carregam. */
export async function rodarLacoDaCampanhaOficial(
  knobs: KnobsDoLacoOficial,
  log: Logger,
  signal: AbortSignal,
  opcoes: {
    carregar?: () => Promise<DepsDoLacoOficial>;
    dormir?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const dormir =
    opcoes.dormir ??
    ((ms: number) =>
      import("node:timers/promises").then(({ setTimeout: sleep }) => sleep(ms, undefined, { signal })));

  let deps: DepsDoLacoOficial;
  try {
    deps = await (opcoes.carregar ?? carregarDeps)();
  } catch (err) {
    log.error("campanha oficial OFF no worker — dependências não carregaram; segue só pelo cron campaign-worker", {
      error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
    });
    return;
  }

  while (!signal.aborted) {
    let trabalhou = false;
    try {
      const r = await deps.rodar(deps.admin);
      trabalhou = rodadaOficialMexeu(r);
      if (trabalhou) {
        void deps.auditar(r);
        log.info("campanha oficial: rodada", {
          enviadas: r.enviadas,
          pulados: r.pulados,
          reenfileirados: r.reenfileirados,
          falharam: r.falharam,
          concluidas: r.concluidas,
          promovidas: r.promovidas,
        });
      }
    } catch (err) {
      log.error("campanha oficial: rodada falhou", {
        error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
      });
    }
    try {
      await dormir(trabalhou ? knobs.intervaloMs : knobs.ociosoMs);
    } catch {
      // `sleep` abortado rejeita — é o desligamento, não um erro.
      return;
    }
  }
}
