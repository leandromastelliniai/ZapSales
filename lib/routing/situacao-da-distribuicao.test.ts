import { describe, expect, it } from "vitest";

import type { RoutingCandidate } from "./decide";
import { montarSituacao, type EntradaDaSituacao } from "./situacao-da-distribuicao";

// Quarta-feira, 15:00 UTC.
const AGORA = new Date("2026-10-28T15:00:00Z");

const MEMBROS = [
  { id: "ana", name: "Ana" },
  { id: "bruno", name: "Bruno" },
  { id: "carla", name: "Carla" },
  { id: "dani", name: "Dani" },
];

const sempreNoHorario = { timezone: "UTC", windows: [] };
const foraDoHorario = { timezone: "UTC", windows: [{ dow: 3, start: "09:00", end: "12:00" }] };

function candidato(userId: string, currentLoad: number, lastAssignedAt: number | null): RoutingCandidate {
  return { userId, currentLoad, lastAssignedAt };
}

function entrada(parcial: Partial<EntradaDaSituacao> = {}): EntradaDaSituacao {
  return {
    membros: MEMBROS,
    disponibilidade: [
      { user_id: "ana", capacity: 5, schedule: sempreNoHorario, is_available: true },
      { user_id: "bruno", capacity: 5, schedule: sempreNoHorario, is_available: true },
      { user_id: "carla", capacity: 2, schedule: sempreNoHorario, is_available: true },
      { user_id: "dani", capacity: 5, schedule: foraDoHorario, is_available: true },
    ],
    cargaPorUsuario: new Map([
      ["ana", 3],
      ["bruno", 1],
      ["carla", 2],
    ]),
    candidatos: [candidato("ana", 3, 1000), candidato("bruno", 1, 2000)],
    fila: 4,
    esperaMediaSegundos: 90,
    modo: "round_robin",
    now: AGORA,
    ...parcial,
  };
}

describe("montarSituacao", () => {
  it("separa quem pode receber de quem está lotado ou fora do horário", () => {
    const s = montarSituacao(entrada());
    const estado = (id: string) => s.pessoas.find((p) => p.id === id)?.estado;
    expect(estado("ana")).toBe("disponivel");
    expect(estado("bruno")).toBe("disponivel");
    expect(estado("carla")).toBe("lotado"); // 2 de 2 conversas
    expect(estado("dani")).toBe("fora_do_horario");
    expect(s.disponiveis).toBe(2);
    expect(s.total).toBe(4);
  });

  it("no rodízio, o próximo é quem está há mais tempo sem receber", () => {
    expect(montarSituacao(entrada()).proximoId).toBe("ana");
  });

  it("no modo 'menos conversas', o próximo é quem tem a menor carga", () => {
    expect(montarSituacao(entrada({ modo: "load" })).proximoId).toBe("bruno");
  });

  it("em 'cada um pega' ninguém é o próximo", () => {
    expect(montarSituacao(entrada({ modo: "manual" })).proximoId).toBeNull();
  });

  it("instalação nova: ninguém tem disponibilidade, então ninguém recebe", () => {
    const s = montarSituacao(entrada({ disponibilidade: [], cargaPorUsuario: new Map(), candidatos: [] }));
    expect(s.disponiveis).toBe(0);
    expect(s.total).toBe(4);
    expect(s.pessoas.every((p) => p.estado === "sem_plantao")).toBe(true);
    expect(s.proximoId).toBeNull();
  });

  it("quem desligou o plantão conta como sem plantão, não como fora do horário", () => {
    const s = montarSituacao(
      entrada({
        disponibilidade: [{ user_id: "ana", capacity: 5, schedule: sempreNoHorario, is_available: false }],
      }),
    );
    expect(s.pessoas.find((p) => p.id === "ana")?.estado).toBe("sem_plantao");
  });

  it("não escolhe como próximo quem o worker listou mas a tela vê como indisponível", () => {
    const s = montarSituacao(entrada({ candidatos: [candidato("carla", 2, 0), candidato("bruno", 1, 2000)] }));
    expect(s.proximoId).toBe("bruno");
  });

  it("repassa a fila e a espera média", () => {
    const s = montarSituacao(entrada());
    expect(s.fila).toBe(4);
    expect(s.esperaMediaSegundos).toBe(90);
  });
});
