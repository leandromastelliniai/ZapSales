/**
 * A SITUAÇÃO DA DISTRIBUIÇÃO: quem, neste instante, pode receber um cliente novo.
 *
 * A tela de Distribuição de atendimento deixava ligar o rodízio sem dizer se ele ia entregar
 * o cliente a alguém. Numa instalação nova ninguém tem disponibilidade configurada, então o
 * rodízio ligava e todo cliente ficava na fila. Este módulo responde, com as MESMAS regras
 * que o roteamento usa, a pergunta que a tela não fazia: "quantas pessoas podem receber agora,
 * quem é o próximo e quantos clientes esperam?".
 *
 * Não cria regra nenhuma:
 *  - a elegibilidade é `isAttendantEligible` (disponível ∧ com folga ∧ dentro do horário);
 *  - o próximo da vez é `selectRoundRobin` / `selectByLoad`, as funções do worker;
 *  - a fila e a espera vêm de `getQueueStatus`, o painel do gerente.
 * Tudo calculado a cada leitura, nada gravado.
 *
 * Só serve a tela de configuração: o cliente admin entra aqui com a organização resolvida da
 * sessão pelo chamador, e a função NUNCA lança (uma tela que serve para consertar a
 * configuração não pode cair porque o painel não carregou).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { availabilityScheduleSchema, type RoutingMode } from "@/lib/schemas/routing";

import { selectByLoad, selectRoundRobin, type RoutingCandidate } from "./decide";
import { isAttendantEligible, OPEN_LOAD_STATUSES } from "./eligibility";
import { loadEligibleAttendants } from "./eligibles";
import { getQueueStatus } from "./queue";

/**
 * Por que uma pessoa pode ou não receber agora:
 *  - `disponivel`: elegível;
 *  - `lotado`: atingiu a capacidade de conversas abertas;
 *  - `fora_do_horario`: de plantão, mas fora da jornada que definiu;
 *  - `sem_plantao`: nunca configurou a disponibilidade, ou está fora de plantão.
 */
export type EstadoDaPessoa = "disponivel" | "lotado" | "fora_do_horario" | "sem_plantao";

export interface PessoaDaDistribuicao {
  id: string;
  nome: string;
  estado: EstadoDaPessoa;
  carga: number;
}

export interface SituacaoDaDistribuicao {
  pessoas: PessoaDaDistribuicao[];
  disponiveis: number;
  total: number;
  /** Quem recebe o próximo cliente no modo salvo; `null` em "cada um pega" ou sem ninguém. */
  proximoId: string | null;
  fila: number;
  esperaMediaSegundos: number;
}

export interface LinhaDeDisponibilidade {
  user_id: string;
  capacity: number;
  schedule: unknown;
  is_available: boolean;
}

export interface EntradaDaSituacao {
  membros: ReadonlyArray<{ id: string; name: string }>;
  disponibilidade: ReadonlyArray<LinhaDeDisponibilidade>;
  cargaPorUsuario: ReadonlyMap<string, number>;
  /** Elegíveis como o worker os vê (com a última atribuição, para o rodízio). */
  candidatos: ReadonlyArray<RoutingCandidate>;
  fila: number;
  esperaMediaSegundos: number;
  modo: RoutingMode | string;
  now: Date;
}

/** Pura: junta os fatos já lidos na situação mostrada. Testável sem banco. */
export function montarSituacao(e: EntradaDaSituacao): SituacaoDaDistribuicao {
  const pessoas = e.membros.map((m): PessoaDaDistribuicao => {
    const carga = e.cargaPorUsuario.get(m.id) ?? 0;
    const linha = e.disponibilidade.find((d) => d.user_id === m.id);
    if (!linha || !linha.is_available) {
      return { id: m.id, nome: m.name, estado: "sem_plantao", carga };
    }
    const elegivel = isAttendantEligible(
      {
        isAvailable: true,
        capacity: linha.capacity,
        currentLoad: carga,
        schedule: availabilityScheduleSchema.parse(linha.schedule ?? {}),
      },
      e.now,
    );
    if (elegivel) return { id: m.id, nome: m.name, estado: "disponivel", carga };
    return {
      id: m.id,
      nome: m.name,
      estado: carga >= linha.capacity ? "lotado" : "fora_do_horario",
      carga,
    };
  });

  const disponiveis = pessoas.filter((p) => p.estado === "disponivel").length;
  const candidatos = e.candidatos.filter((c) =>
    pessoas.some((p) => p.id === c.userId && p.estado === "disponivel"),
  );
  const proximoId =
    e.modo === "round_robin"
      ? selectRoundRobin([...candidatos])
      : e.modo === "load"
        ? selectByLoad([...candidatos])
        : null;

  return {
    pessoas,
    disponiveis,
    total: pessoas.length,
    proximoId,
    fila: e.fila,
    esperaMediaSegundos: e.esperaMediaSegundos,
  };
}

/** Leitura + montagem. Devolve `null` se qualquer leitura falhar: a tela segue sem a faixa. */
export async function situacaoDaDistribuicao(
  db: SupabaseClient,
  organizationId: string,
  membros: ReadonlyArray<{ id: string; name: string }>,
  modo: RoutingMode | string,
  now: Date,
): Promise<SituacaoDaDistribuicao | null> {
  try {
    const ids = membros.map((m) => m.id);
    const [disp, abertas, candidatos, fila] = await Promise.all([
      db
        .from("attendant_availability")
        .select("user_id, capacity, schedule, is_available")
        .eq("organization_id", organizationId),
      ids.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db
            .from("conversations")
            .select("assigned_to_user_id")
            .eq("organization_id", organizationId)
            .in("assigned_to_user_id", ids)
            .in("status", OPEN_LOAD_STATUSES as unknown as string[]),
      loadEligibleAttendants(db, organizationId, now, { kind: "organization_summary" }),
      getQueueStatus(db, organizationId, now),
    ]);
    if (disp.error) return null;
    if (abertas.error) return null;

    const cargaPorUsuario = new Map<string, number>();
    for (const c of (abertas.data ?? []) as Array<{ assigned_to_user_id: string | null }>) {
      if (c.assigned_to_user_id) {
        cargaPorUsuario.set(c.assigned_to_user_id, (cargaPorUsuario.get(c.assigned_to_user_id) ?? 0) + 1);
      }
    }

    return montarSituacao({
      membros,
      disponibilidade: (disp.data ?? []) as LinhaDeDisponibilidade[],
      cargaPorUsuario,
      candidatos,
      fila: fila.queue_size,
      esperaMediaSegundos: fila.avg_wait_seconds,
      modo,
      now,
    });
  } catch {
    return null;
  }
}
