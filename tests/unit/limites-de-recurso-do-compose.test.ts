import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TODO SERVIÇO QUE O CLIENTE INSTALA TEM TETO DE MEMÓRIA E DE CPU.
 *
 * O ZapSales roda numa VPS que já hospeda outros apps (issue #3: "convivendo
 * com outros apps"). Sem teto, um serviço nosso que dispara — o Postgres numa
 * consulta pesada, o WAHA com muitas sessões, um laço do worker — leva a
 * máquina inteira, e os sites dos OUTROS caem junto. O `mem_limit` sozinho não
 * basta: memória sob teto e CPU livre ainda deixa um laço quente travar o
 * proxy que atende todo mundo.
 *
 * Os dois arquivos do escopo são os que a instalação sobe juntos
 * (`COMPOSE_FILE` gravado pelo kit). O override do modo "convivendo" fica de
 * fora: ele não declara serviço novo, só troca as portas do proxy.
 */

const RAIZ = process.cwd();
const ARQUIVOS = ["docker-compose.prod.yml", "docker-compose.supabase.yml"] as const;

function lerServicos(yaml: string): Map<string, string> {
  const servicos = new Map<string, string>();
  let dentro = false;
  let atual: string | null = null;
  let buffer: string[] = [];
  const fechar = () => {
    if (atual) servicos.set(atual, buffer.join("\n"));
    atual = null;
    buffer = [];
  };
  for (const linha of yaml.split("\n")) {
    if (/^services:\s*$/.test(linha)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^\S/.test(linha) && linha.trim() !== "") {
      fechar();
      dentro = false;
      continue;
    }
    const cabecalho = linha.match(/^ {2}([a-z0-9_-]+):\s*$/i);
    if (cabecalho) {
      fechar();
      atual = cabecalho[1] ?? null;
      continue;
    }
    if (atual) buffer.push(linha);
  }
  fechar();
  return servicos;
}

const semComentarios = (b: string) =>
  b
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

describe("limites de recurso do que o cliente instala", () => {
  for (const arquivo of ARQUIVOS) {
    const servicos = lerServicos(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));

    it(`${arquivo}: o parser enxerga serviços`, () => {
      // Guarda do instrumento: parser quebrado deixaria os casos abaixo verdes.
      expect(servicos.size).toBeGreaterThan(3);
    });

    it(`${arquivo}: todo serviço declara mem_limit e cpus`, () => {
      const semTeto: string[] = [];
      for (const [nome, bloco] of servicos) {
        const limpo = semComentarios(bloco);
        if (!/^\s{4}mem_limit:\s*\S/m.test(limpo)) semTeto.push(`${nome} (mem_limit)`);
        if (!/^\s{4}cpus:\s*\S/m.test(limpo)) semTeto.push(`${nome} (cpus)`);
      }
      expect(
        semTeto,
        `serviço sem teto em ${arquivo}: ${semTeto.join(", ")}. Numa VPS compartilhada, ` +
          `um serviço sem teto derruba os sites dos outros apps junto com o nosso.`,
      ).toEqual([]);
    });

    it(`${arquivo}: todo serviço volta sozinho depois de reiniciar a VPS`, () => {
      const semRestart = [...servicos.entries()]
        .filter(([, b]) => !/^\s{4}restart:\s*(unless-stopped|always)\s*$/m.test(semComentarios(b)))
        .map(([nome]) => nome);
      expect(
        semRestart,
        `serviço sem restart unless-stopped/always: ${semRestart.join(", ")}. ` +
          `Depois de um reboot da VPS ele fica parado até alguém perceber.`,
      ).toEqual([]);
    });
  }
});

/**
 * CPU DO TRIO DE LOGIN/REST/STORAGE (#66, parte 3 da #63).
 *
 * Em produção (8 núcleos, 32 GB, ociosa) os três rodavam com `cpus: 0.5` e o
 * cgroup limitava de 2,5% a 12,3% dos períodos de 100 ms. O GoTrue valida o
 * usuário de TODA requisição logada, então meio núcleo vira fila. Este bloco
 * trava o contrato que a atualização do kit entrega SEM edição manual: teto
 * com default numérico (um `.env` antigo, sem a variável, continua válido) e
 * threads do GoTrue coerentes com o teto.
 */
describe("CPU do auth, rest e storage (#66)", () => {
  const servicos = lerServicos(
    fs.readFileSync(path.join(RAIZ, "docker-compose.supabase.yml"), "utf8"),
  );
  const cpusDe = (nome: string) => {
    const m = semComentarios(servicos.get(nome) ?? "").match(
      /^\s{4}cpus:\s*\$\{(\w+):-([0-9.]+)\}\s*$/m,
    );
    return m ? { variavel: m[1]!, padrao: Number(m[2]) } : null;
  };

  for (const nome of ["auth", "rest", "storage"]) {
    it(`${nome}: teto de CPU configurável, com padrão >= 1 núcleo e que cabe numa VPS de 2`, () => {
      const cpus = cpusDe(nome);
      expect(cpus, `${nome}: cpus deve ser \${VAR:-numero}`).not.toBeNull();
      expect(cpus!.variavel).toBe(`SUPABASE_${nome.toUpperCase()}_CPUS`);
      expect(cpus!.padrao).toBeGreaterThanOrEqual(1);
      // O Docker recusa subir com cpus > núcleos da máquina; o `app` já exige 2.
      expect(cpus!.padrao).toBeLessThanOrEqual(2);
    });
  }

  it("auth: GOMAXPROCS vem de variável com default inteiro igual ao teto padrão", () => {
    const bloco = semComentarios(servicos.get("auth") ?? "");
    const m = bloco.match(/^\s{6}GOMAXPROCS:\s*\$\{SUPABASE_AUTH_THREADS:-(\d+)\}\s*$/m);
    expect(m, "auth sem GOMAXPROCS=${SUPABASE_AUTH_THREADS:-N}").not.toBeNull();
    expect(Number(m![1])).toBe(cpusDe("auth")!.padrao);
  });
});
