import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DICROMACIAS,
  LIMIAR_ACROMATICO,
  PISOS,
  PISO_DE_CROMA,
  PISO_DE_SEPARACAO_DO_NEUTRO,
  PISO_DE_SEPARACAO_SIMULADA,
  ROTACAO_MAXIMA,
  deltaESimulado,
  derivarMarca,
  escolherAccent,
  extrairRegua,
  medirPares,
  melhorFrenteSobre,
  razaoDeContraste,
  reconciliarSemanticas,
  separacaoDoNeutro,
  simularDicromacia,
  superficiesDoTema,
} from "@/lib/branding/contraste";
import type { Regua, TemaDaRegua } from "@/lib/branding/contraste";
import { deltaEOklab, hexParaOklch, rampaDeSemente } from "@/lib/branding/rampa";
import type { Rampa } from "@/lib/branding/rampa";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
const REGUA: Regua = extrairRegua(CSS);

const rampaChapada = (hex: string): Rampa =>
  Array.from({ length: 11 }, () => hex) as unknown as Rampa;

/**
 * Fixture adversarial VERSIONADA. Não é amostra aleatória: cada semente foi posta aqui
 * por causar um modo de falha distinto.
 *
 *  `#0f172a`, `#1a1f36` — navy corporativa, croma baixíssimo (0,0398 e 0,0444); é onde
 *                         a ancoragem por lightness entrega outra cor ao cliente.
 *  `#f5c518`, `#f59e0b` — amarelo/âmbar: não alcançam 3:1 contra branco em NENHUM
 *                         universo, então forçam a caminhada de contraste a andar.
 *  `#ffffff`, `#000000`, `#808080`, `#fafafa` — croma zero: o caminho acromático.
 *  `#dc2626`, `#e11d48` — marca vermelha, que colide com `--color-error` sob protanopia.
 *  `#22c55e` — marca verde, que colide com `--color-success`.
 *  `#f59e0b` — marca âmbar, que colide com `--color-warning`.
 *  `#2563eb` — marca azul, que colide com `--color-info`.
 *  `#14b8a6`, `#4b0082`, `#7c3aed` — extremos de croma e de matiz, para o clamp de gamut.
 *  `#506d48` — verde-sálvia (a antiga semente Sage do produto): colide com o
 *              `--color-success` do tema claro (ΔE 0,0185) SEM rotação que resolva — é a
 *              semente que alcança o ramo do sinal `redundancia_nao_cromatica_necessaria`.
 *  `#773df9` — o violeta Futuristas, semente do próprio produto: CONTROLE POSITIVO. Sem
 *              ele, um algoritmo que devolvesse cinza para tudo passaria em "nenhum papel
 *              abaixo do piso".
 */
const FIXTURE = [
  "#0f172a",
  "#f5c518",
  "#ffffff",
  "#000000",
  "#808080",
  "#dc2626",
  "#22c55e",
  "#f59e0b",
  "#2563eb",
  "#14b8a6",
  "#4b0082",
  "#e11d48",
  "#7c3aed",
  "#1a1f36",
  "#fafafa",
  "#506d48",
  "#773df9",
] as const;

describe("extrairRegua — os pares saem do globals.css, nunca de lista à mão", () => {
  it("acha os dois temas, a rampa do produto e os neutros", () => {
    expect(REGUA.rampaDoProduto).toHaveLength(11);
    expect(REGUA.rampaDoProduto[6]).toBe("#773df9");
    expect(REGUA.claro.neutros).toHaveLength(11);
    expect(REGUA.escuro.neutros[9]).toBe("#151a2e");
    expect(REGUA.claro.base.map((b) => b.chave)).toEqual([
      "--color-bg",
      "--color-surface",
      "--color-surface-elevated",
    ]);
  });

  it("alcança o anel de foco, que mora em @layer base e uma lista à mão perderia", () => {
    // ESTE é o par do relato: `accent-600` contra bg dá 5,09 e passaria qualquer gate
    // ingênuo, mas quem pinta o anel é `accent-500` — e ele dá 3,53. Uma régua que só
    // olhasse o stop da semente deixaria o anel pousar em ~2,07 com o gate verde.
    const foco = REGUA.claro.papeis.find((p) => p.token.includes(":focus-visible"));
    expect(foco, "o anel de foco sumiu da régua").toBeDefined();
    expect(foco?.tipo).toBe("componente");
    expect(foco?.fonte).toMatchObject({ tipo: "grau", indice: 5 });

    const focoEscuro = REGUA.escuro.papeis.find((p) => p.token.includes(":focus-visible"));
    expect(focoEscuro?.fonte).toMatchObject({ tipo: "grau", indice: 4 });
  });

  it("classifica -fg como texto e -soft como superfície", () => {
    const fg = REGUA.claro.papeis.find((p) => p.token === "--color-accent-fg");
    expect(fg?.tipo).toBe("texto");
    expect(REGUA.claro.tingidas.map((t) => t.chave)).toEqual(["--color-accent-soft"]);
    // No escuro o token é o literal `rgba(158, 138, 255, 0.16)` — a tinta do stop 400
    // (`#9e8aff`, o accent do escuro), sem referência à rampa. É por isso que ele precisa
    // ser REANCORADO na derivação.
    expect(REGUA.escuro.indices.soft).toBeNull();
    expect(REGUA.escuro.alfaDoSoft).toBeCloseTo(0.16, 6);
  });

  it("enumera o conjunto esperado de papéis e pares (guarda de vacuidade)", () => {
    // Números medidos no globals.css @ este commit. Se a folha ganhar um papel novo e
    // ninguém atualizar aqui, o teste reprova — que é o aviso certo: papel novo entra na
    // conta de contraste, não fica de fora em silêncio.
    expect(REGUA.claro.papeis.map((p) => p.token).sort()).toEqual([
      "--color-accent",
      "--color-accent-fg",
      "--color-accent-hover",
      "--ring",
      "::selection/color",
      ":focus-visible/outline",
    ]);
    expect(REGUA.escuro.papeis).toHaveLength(6);

    expect(superficiesDoTema(REGUA.claro, REGUA.rampaDoProduto, 0)).toHaveLength(4);
    // 6 no escuro e não 4: o `-soft` translúcido compõe sobre CADA base, e as três
    // razões diferem (4,78 · 4,27 · 3,78). Medir uma só escolheria a mais folgada.
    expect(superficiesDoTema(REGUA.escuro, REGUA.rampaDoProduto, 0)).toHaveLength(6);

    expect(medirPares(REGUA.claro, REGUA.rampaDoProduto, 0)).toHaveLength(18);
    expect(medirPares(REGUA.escuro, REGUA.rampaDoProduto, 0)).toHaveLength(26);
  });

  it("reproduz as razões medidas à mão no design system", () => {
    const pares = medirPares(REGUA.claro, REGUA.rampaDoProduto, 0);
    const razao = (papel: string, superficie: string) =>
      pares.find((p) => p.papel === papel && p.superficie === superficie)?.razao ?? 0;

    expect(razao("--color-accent", "--color-bg")).toBeCloseTo(5.09, 2);
    expect(razao(":focus-visible/outline", "--color-bg")).toBeCloseTo(3.53, 2);
    expect(razao(":focus-visible/outline", "--color-surface-elevated")).toBeCloseTo(3.29, 2);
  });

  it("a paleta violeta Futuristas inteira, como está no CSS, cabe nos pisos", () => {
    for (const tema of [REGUA.claro, REGUA.escuro]) {
      const reprovas = medirPares(tema, REGUA.rampaDoProduto, 0).filter((p) => !p.passa);
      expect(reprovas, `${tema.nome}: ${JSON.stringify(reprovas)}`).toEqual([]);
    }
  });
});

describe("dicromacia — a régua de ângulo ordena INVERTIDO", () => {
  it("reproduz o par que derruba a régua de ângulo", () => {
    const anguloEntre = (a: string, b: string) => {
      const d = Math.abs(hexParaOklch(a).h - hexParaOklch(b).h);
      return d > 180 ? 360 - d : d;
    };
    const warning = "#b07a2b";
    const success = "#5a8a5f";

    // Oliva: ângulo GRANDE (44,7°) e separação PÉSSIMA (0,0231).
    expect(anguloEntre("#7f8c3a", warning)).toBeCloseTo(44.7, 1);
    expect(deltaESimulado("#7f8c3a", warning)).toBeCloseTo(0.0231, 4);

    // Verde-água: ângulo PEQUENO (27,2°) e separação BOA (0,1262).
    expect(anguloEntre("#1abc9c", success)).toBeCloseTo(27.2, 1);
    expect(deltaESimulado("#1abc9c", success)).toBeCloseTo(0.1262, 4);

    // A inversão, dita como asserção: quem tem mais ângulo tem menos separação real.
    expect(anguloEntre("#7f8c3a", warning)).toBeGreaterThan(anguloEntre("#1abc9c", success));
    expect(deltaESimulado("#7f8c3a", warning)).toBeLessThan(deltaESimulado("#1abc9c", success));
  });

  it("a simulação de fato colapsa o eixo vermelho-verde", () => {
    // Controle positivo da matriz. O par é construído com a MESMA lightness OKLab
    // (L=0,60, C=0,12, h=25° e h=145°): dicromacia preserva luminosidade, então um par
    // vermelho/verde de luminosidades diferentes continuaria distinguível pelo brilho e
    // o teste mediria a coisa errada — foi o que aconteceu com `#c0392b`×`#27ae60`, que
    // só cai 22% sob protanopia porque o vermelho já era mais escuro.
    const vermelho = "#bd615b";
    const verde = "#4d9351";
    const cru = deltaEOklab(vermelho, verde);
    expect(cru).toBeGreaterThan(0.2);
    for (const tipo of DICROMACIAS) {
      const simulado = deltaEOklab(
        simularDicromacia(vermelho, tipo),
        simularDicromacia(verde, tipo),
      );
      expect(simulado, tipo).toBeLessThan(cru * 0.5);
    }
    // Sob deuteranopia o colapso é quase total — 0,0076 contra 0,2080 crus. Matriz
    // identidade (a sabotagem óbvia) devolveria 0,2080 e reprovaria aqui.
    expect(
      deltaEOklab(
        simularDicromacia(vermelho, "deuteranopia"),
        simularDicromacia(verde, "deuteranopia"),
      ),
    ).toBeLessThan(cru * 0.1);
    // E NÃO colapsa o eixo azul-amarelo, que a dicromacia vermelho-verde preserva: uma
    // matriz que zerasse tudo também passaria no teste acima.
    expect(deltaESimulado("#2563eb", "#f5c518")).toBeGreaterThan(
      deltaEOklab("#2563eb", "#f5c518") * 0.85,
    );
  });

  it("usa o PIOR caso entre as dicromacias, não a média", () => {
    // `#a94a3c` × `#506d48` mede 0,0505 sob deuteranopia e 0,0434 sob protanopia. Média
    // daria 0,047 e a decisão mudaria; o piso existe para a pessoa que enxerga pior.
    const alvo = deltaESimulado("#a94a3c", "#506d48");
    const porTipo = DICROMACIAS.map((t) =>
      deltaEOklab(simularDicromacia("#a94a3c", t), simularDicromacia("#506d48", t)),
    );
    expect(alvo).toBeCloseTo(Math.min(...porTipo), 10);
    expect(Math.max(...porTipo)).toBeGreaterThan(alvo);
  });
});

describe("derivarMarca — as 17 sementes adversariais", () => {
  const resultados = FIXTURE.map((s) => ({ semente: s, marca: derivarMarca(s, REGUA) }));

  it("a fixture tem o tamanho e o controle positivo que declara", () => {
    expect(FIXTURE).toHaveLength(17);
    expect(new Set(FIXTURE).size).toBe(17);
    // O controle positivo é a semente do PRÓPRIO produto, lida do CSS — e não um hex
    // que já foi a semente um dia.
    expect(FIXTURE).toContain(REGUA.rampaDoProduto[6]);
  });

  it("nenhum papel fica abaixo do piso, em nenhum dos dois temas", () => {
    for (const { semente, marca } of resultados) {
      for (const tema of [marca.claro, marca.escuro] as const) {
        // Guarda de vacuidade POR SEMENTE: um `pares: []` faria o filtro abaixo devolver
        // lista vazia e o teste passar sem ter medido nada.
        expect(tema.pares.length, `${semente}: nenhum par medido`).toBeGreaterThanOrEqual(18);
        const reprovas = tema.pares.filter((p) => !p.passa);
        expect(
          reprovas,
          `${semente} · grau ${tema.grauDoAccent}: ` +
            reprovas
              .map((r) => `${r.papel}×${r.superficie}=${r.razao.toFixed(2)}<${r.piso}`)
              .join(", "),
        ).toEqual([]);
      }
    }
  });

  it("a caminhada de contraste de fato ANDA — e nas sementes previstas", () => {
    // Guarda contra o teste vácuo: se nada deslocasse no run inteiro, "todos os papéis
    // passam" seria uma afirmação sobre uma caminhada que nunca aconteceu.
    const deslocados = resultados.flatMap(({ semente, marca }) =>
      [marca.claro, marca.escuro]
        .filter((t) => t.deslocamento !== 0)
        .map((t) => `${semente}/${t.deslocamento}`),
    );
    expect(deslocados.length).toBeGreaterThan(0);
    expect(deslocados).toHaveLength(13);

    // O amarelo é o caso que NÃO tem escapatória física: nenhum stop claro de amarelo
    // alcança 3:1 contra `#ffffff`. Se ele parar de andar, a caminhada quebrou.
    const amarelo = resultados.find((r) => r.semente === "#f5c518")!.marca;
    expect(amarelo.claro.deslocamento).toBeGreaterThan(0);
    expect(amarelo.claro.grauDoAccent).toBe(900);
    // …e o hex EXATO do cliente reaparece como accent do tema escuro.
    expect(amarelo.escuro.accent).toBe("#f5c518");
  });

  it("nunca torce o accent: ele é sempre um stop da rampa da marca", () => {
    // (c) da doutrina: o accent é a única cor que não nos pertence. Se algum caminho
    // "ajustasse" o accent para folgar de uma semântica, este teste pega.
    for (const { semente, marca } of resultados) {
      if (marca.origemDaRampa !== "semente") continue;
      const rampa = rampaDeSemente(semente);
      expect(rampa, `${semente}`).toContain(marca.claro.accent);
      expect(rampa, `${semente}`).toContain(marca.escuro.accent);
      expect(marca.marca).toBe(semente);
    }
  });

  it("emite motivo sempre que mexe em alguma coisa, e nunca vaza o hex da marca", () => {
    for (const { semente, marca } of resultados) {
      const codigos = marca.motivos.map((m) => m.codigo);
      const mexeu =
        marca.claro.deslocamento !== 0 ||
        marca.escuro.deslocamento !== 0 ||
        marca.origemDaRampa === "produto";
      if (mexeu) expect(codigos.length, semente).toBeGreaterThan(0);
      // Diagnóstico emite FORMA, nunca IDENTIDADE: este objeto vai para log, e a cor da
      // marca de uma empresa não tem por que aparecer no log de outra.
      for (const m of marca.motivos) {
        expect(m.detalhe.toLowerCase(), `${semente} · ${m.codigo}`).not.toContain(
          semente.replace("#", ""),
        );
      }
    }
  });

  it("--color-accent-fg é calculado, e muda de lado conforme o accent", () => {
    // ATENÇÃO à vacuidade aqui, e ela é real: nas 17 sementes o tema claro SEMPRE cai em
    // branco e o escuro SEMPRE em preto — não porque o valor seja fixo por tema, mas
    // porque a caminhada de contraste empurra o accent claro para longe das superfícies
    // claras e o escuro para longe das escuras. Contar dois valores distintos no run,
    // portanto, NÃO prova que o cálculo responde ao accent; prova só que os temas
    // diferem. Quem prova a responsividade é o bloco abaixo, sobre a função direta.
    expect(melhorFrenteSobre("#f5c518")).toBe("#000000"); // amarelo vivo → texto preto
    expect(melhorFrenteSobre("#0f172a")).toBe("#ffffff"); // navy → texto branco
    // O par crítico: dois stops ADJACENTES da MESMA rampa violeta que pedem frentes
    // opostas. `#773df9` (600) dá 5,50 com branco e 3,82 com preto; `#8a68ff` (500) dá
    // 3,81 com branco e 5,50 com preto. Um valor fixo por tema erraria um dos dois — e
    // um deslocamento de UM grau é exatamente o que a caminhada de contraste faz.
    expect(REGUA.rampaDoProduto[6]).toBe("#773df9");
    expect(REGUA.rampaDoProduto[5]).toBe("#8a68ff");
    expect(melhorFrenteSobre("#773df9")).toBe("#ffffff");
    expect(melhorFrenteSobre("#8a68ff")).toBe("#000000");

    for (const { semente, marca } of resultados) {
      for (const tema of [marca.claro, marca.escuro] as const) {
        expect(razaoDeContraste(tema.accentFg, tema.accent), semente).toBeGreaterThanOrEqual(
          PISOS.texto,
        );
        expect(tema.accentFg).toBe(melhorFrenteSobre(tema.accent));
      }
    }
  });

  it("--color-accent-soft do tema escuro é derivado, não o violeta cru", () => {
    // O literal `rgba(158, 138, 255, 0.16)` sobreviveria intacto a qualquer override da
    // rampa — seria um pedaço da NOSSA marca dentro da instalação do cliente.
    expect(CSS).toContain("--color-accent-soft: rgba(158, 138, 255, 0.16)");
    const azul = derivarMarca("#2563eb", REGUA);
    expect(azul.escuro.accentSoft).toMatch(/^rgba\(\d+, \d+, \d+, 0\.16\)$/);
    expect(azul.escuro.accentSoft).not.toContain("158, 138, 255");
    // E o claro continua opaco, como o tema declara.
    expect(azul.claro.accentSoft).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("reconciliação — quem se move são as NOSSAS semânticas", () => {
  it("a colisão semântica × accent dispara a reconciliação (controle positivo)", () => {
    // A paleta Sage nascia colidida: o `--color-success` escuro era a MESMA string do
    // `--color-accent-400` (Δ = 0,0), e o próprio produto exercitava o mecanismo. O
    // violeta Futuristas NÃO nasce colidido — a semântica mais próxima do accent é
    // `info` no escuro, a ΔE 0,1180, longe do piso 0,05 —, então a semente do produto
    // não mexe em nada. Isto é fixado aqui, porque é o que obriga o controle abaixo a
    // FORÇAR a colisão em vez de esperá-la da paleta.
    const produto = derivarMarca(REGUA.rampaDoProduto[6], REGUA);
    expect(produto.motivos).toEqual([]);

    // (1) A colisão da Sage, recriada sobre a régua de hoje: `success` do escuro passa a
    // ser literalmente o `accent-400`. Se o mecanismo não disparasse aqui, ele não
    // dispararia em lugar nenhum.
    const colidida: Regua = {
      ...REGUA,
      escuro: {
        ...REGUA.escuro,
        semanticas: REGUA.escuro.semanticas.map((s) =>
          s.nome === "success" ? { ...s, hex: REGUA.rampaDoProduto[4] } : s,
        ),
      },
    };
    expect(colidida.escuro.semanticas.find((s) => s.nome === "success")?.hex).toBe("#9e8aff");
    const forcada = derivarMarca(REGUA.rampaDoProduto[6], colidida);
    const movidasForcadas = forcada.motivos.filter((m) => m.codigo === "semantica_deslocada");
    expect(movidasForcadas.length).toBeGreaterThan(0);
    expect(movidasForcadas.map((m) => `${m.tema}/${m.alvo}`)).toEqual(["escuro/success"]);
    // …e a cor que a marca recebe NÃO é mais a colidida.
    expect(forcada.escuro.semanticas.success).not.toBe(REGUA.rampaDoProduto[4]);

    // (2) A colisão natural, com a régua de hoje intacta: a marca carmim `#e11d48` cai
    // em cima de `success` nos dois temas e de `error` no escuro.
    const carmim = derivarMarca("#e11d48", REGUA);
    const movidas = carmim.motivos.filter((m) => m.codigo === "semantica_deslocada");
    expect(movidas).toHaveLength(3);
    expect(movidas.map((m) => `${m.tema}/${m.alvo}`)).toEqual([
      "claro/success",
      "escuro/success",
      "escuro/error",
    ]);
  });

  it("devolve sinal — e não distorção — quando não há rotação que resolva", () => {
    // O laço de retorno do invariante 7 da doutrina Sistema Vivo: a peça diz o que muda
    // no sistema quando ela não consegue resolver. Com o verde-sálvia `#506d48` (a
    // antiga semente Sage) como marca, o accent claro fica a ΔE 0,0185 do `success`
    // claro (`#0f7a55`); girar até 60° ou continua colado no accent ou chega mais perto
    // de `info` (`#0d7480`, a 0,0705 do success) do que o original estava.
    expect(deltaESimulado("#0f7a55", "#506d48")).toBeCloseTo(0.0185, 4);
    const salvia = derivarMarca("#506d48", REGUA);
    expect(salvia.claro.accent).toBe("#506d48");
    const sinais = salvia.motivos.filter(
      (m) => m.codigo === "redundancia_nao_cromatica_necessaria",
    );
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({ tema: "claro", alvo: "success" });
    expect(sinais[0]!.detalhe).toMatch(/ícone|rótulo/);
    // Sinal, e não distorção: o `success` claro sai como estava.
    expect(salvia.claro.semanticas.success).toBe("#0f7a55");
  });

  it("não inventa rotação impossível numa semântica sem croma", () => {
    // Girar o matiz de uma cor de croma zero não muda nada — é o caso em que a rotação
    // NÃO PODE funcionar, e o algoritmo tem de dizer isso em vez de fingir.
    const r = reconciliarSemanticas("#808080", [
      { nome: "success", hex: "#7f7f7f" },
      { nome: "warning", hex: "#b07a2b" },
    ]);
    expect(r.semSaida.map((s) => s.nome)).toEqual(["success"]);
    expect(r.movimentos).toEqual([]);
    expect(r.cores.success).toBe("#7f7f7f");
  });

  it("toda semântica movida folga do accent e continua dentro do orçamento de rotação", () => {
    let movimentosNoRun = 0;
    for (const semente of FIXTURE) {
      const marca = derivarMarca(semente, REGUA);
      for (const [tema, regua] of [
        [marca.claro, REGUA.claro],
        [marca.escuro, REGUA.escuro],
      ] as const) {
        const r = reconciliarSemanticas(tema.accent, regua.semanticas);
        movimentosNoRun += r.movimentos.length;
        for (const m of r.movimentos) {
          expect(Math.abs(m.rotacao), `${semente} ${m.nome}`).toBeLessThanOrEqual(ROTACAO_MAXIMA);
          expect(m.separacaoDepois).toBeGreaterThanOrEqual(PISO_DE_SEPARACAO_SIMULADA);
          expect(m.separacaoDepois).toBeGreaterThan(m.separacaoAntes);
          expect(m.para).not.toBe(m.de);
        }
        // O que NÃO se moveu já folgava — senão teria virado `semSaida`.
        for (const s of regua.semanticas) {
          const moveu = r.movimentos.some((m) => m.nome === s.nome);
          const semSaida = r.semSaida.some((x) => x.nome === s.nome);
          if (!moveu && !semSaida) {
            expect(
              deltaESimulado(s.hex, tema.accent),
              `${semente} ${s.nome}`,
            ).toBeGreaterThanOrEqual(PISO_DE_SEPARACAO_SIMULADA);
          }
        }
      }
    }
    // Guarda de vacuidade do run inteiro: 11 movimentos medidos nas 17 sementes contra
    // a régua violeta Futuristas (eram 23 contra a Sage, que nascia colidida).
    expect(movimentosNoRun).toBe(11);
  });
});

describe("marca acromática — o accent do produto permanece", () => {
  const CINZAS = ["#808080", "#000000", "#ffffff", "#fafafa"] as const;

  it("cinza, preto e branco não viram accent", () => {
    for (const cinza of CINZAS) {
      const marca = derivarMarca(cinza, REGUA);
      expect(hexParaOklch(cinza).C, cinza).toBeLessThan(LIMIAR_ACROMATICO);
      expect(marca.origemDaRampa, cinza).toBe("produto");
      expect(marca.rampa).toEqual(REGUA.rampaDoProduto);
      // O hex do cliente NÃO some: vai para `--color-brand` (logo, selo, e-mail).
      expect(marca.marca).toBe(cinza);
      const motivo = marca.motivos.find((m) => m.codigo === "marca_acromatica");
      expect(motivo?.alvo, cinza).toBe("--color-brand");
    }
  });

  it("o accent que permanece é cromático e separável do neutro do mesmo grau", () => {
    const marca = derivarMarca("#808080", REGUA);
    for (const [tema, regua] of [
      [marca.claro, REGUA.claro],
      [marca.escuro, REGUA.escuro],
    ] as const) {
      expect(hexParaOklch(tema.accent).C).toBeGreaterThanOrEqual(PISO_DE_CROMA);
      expect(separacaoDoNeutro(regua, tema.grauDoAccent, tema.accent)).toBeGreaterThanOrEqual(
        PISO_DE_SEPARACAO_DO_NEUTRO,
      );
    }
    // Os números exatos do violeta Futuristas, fixados: 0,2291 no claro (accent-600
    // `#773df9` × neutral-600 `#4b5373`) e 0,1277 no escuro (accent-400 `#9e8aff` ×
    // neutral-400 `#8a93b2`).
    expect(
      separacaoDoNeutro(REGUA.claro, marca.claro.grauDoAccent, marca.claro.accent),
    ).toBeCloseTo(0.2291, 4);
    expect(
      separacaoDoNeutro(REGUA.escuro, marca.escuro.grauDoAccent, marca.escuro.accent),
    ).toBeCloseTo(0.1277, 4);
    // Por que o piso é 0,05 e não o 0,08 do briefing (8, na convenção ×100): a Sage, que
    // foi a paleta do produto, media 0,0681 no claro (accent-600 `#506d48` × greige
    // neutral-600 `#5d594f`). O 0,08 reprovaria uma paleta que o produto de fato usou —
    // o registro fica como medida dos dois hex literais, não da régua de hoje.
    expect(deltaEOklab("#506d48", "#5d594f")).toBeCloseTo(0.0681, 4);
    expect(deltaEOklab("#506d48", "#5d594f")).toBeLessThan(0.08);
    expect(deltaEOklab("#506d48", "#5d594f")).toBeGreaterThanOrEqual(PISO_DE_SEPARACAO_DO_NEUTRO);

    // Controle negativo: um accent cinza reprovaria as duas guardas. Sem esta linha, os
    // pisos acima poderiam ser satisfeitos por qualquer coisa.
    expect(hexParaOklch("#5d594f").C).toBeLessThan(PISO_DE_CROMA);
    expect(deltaEOklab("#5d594f", "#5d594f")).toBe(0);
  });

  it("navy NÃO é acromática — o gatilho não decide no quarto decimal", () => {
    // As duas navies da fixture ficam em lados OPOSTOS de `PISO_DE_CROMA` por 0,0046:
    // `#0f172a` mede 0,039824 e `#1a1f36` mede 0,044430. Um gatilho ali decidiria no
    // quarto decimal se a navy mais comum do mundo corporativo pinta a interface — e a
    // resposta mudaria com um arredondamento de hex. Esta asserção fixa o straddle: é o
    // que reprova se alguém "simplificar" reusando `PISO_DE_CROMA` como gatilho.
    expect(hexParaOklch("#0f172a").C).toBeLessThan(PISO_DE_CROMA);
    expect(hexParaOklch("#1a1f36").C).toBeGreaterThan(PISO_DE_CROMA);
    expect(Math.abs(hexParaOklch("#0f172a").C - hexParaOklch("#1a1f36").C)).toBeLessThan(0.005);

    for (const navy of ["#0f172a", "#1a1f36"] as const) {
      const marca = derivarMarca(navy, REGUA);
      expect(hexParaOklch(navy).C, navy).toBeGreaterThan(LIMIAR_ACROMATICO);
      expect(marca.origemDaRampa, navy).toBe("semente");
      expect(marca.claro.accent, navy).toBe(navy);
    }
  });
});

describe("ramo degradado — rampas que não têm solução", () => {
  const SINTETICAS: readonly (readonly [string, Rampa])[] = [
    // L uniforme: andar na rampa não muda contraste nenhum, então nenhum deslocamento
    // pode ajudar — é o caso em que a caminhada tem de desistir e DIZER que desistiu.
    ["L uniforme", rampaChapada("#7f7f7f")],
    ["toda clara", rampaChapada("#f2f2f2")],
    ["toda escura", rampaChapada("#101010")],
  ];

  it("alcança o caminho de fallback nos dois temas, para as três rampas", () => {
    const alcancados: string[] = [];
    for (const [nome, rampa] of SINTETICAS) {
      for (const tema of [REGUA.claro, REGUA.escuro]) {
        const escolha = escolherAccent(rampa, tema);
        expect(escolha.motivo, `${nome}/${tema.nome}`).toBe("sem_deslocamento_que_satisfaz");
        expect(escolha.reprovas.length).toBeGreaterThan(0);
        expect(escolha.pares.length).toBeGreaterThan(0);
        // Degradado NÃO é lançar: `derivarMarca` roda no caminho de render do layout, e
        // um throw ali é 500 em todas as telas.
        expect(() => escolherAccent(rampa, tema)).not.toThrow();
        alcancados.push(`${nome}/${tema.nome}`);
      }
    }
    expect(alcancados).toHaveLength(6);
  });

  it("uma rampa chapada não tem contraste interno nem com deslocamento", () => {
    // Controle positivo do ramo: o par `::selection` mede stop contra stop DENTRO da
    // rampa. Numa rampa de cor única ele vale 1,00 em qualquer deslocamento — é a prova
    // de que a reprova é estrutural e não um deslocamento mal escolhido.
    const escolha = escolherAccent(rampaChapada("#7f7f7f"), REGUA.claro);
    const selecao = escolha.pares.find((p) => p.papel.includes("::selection"));
    expect(selecao?.razao).toBeCloseTo(1, 6);
    expect(selecao?.passa).toBe(false);
  });

  it("uma rampa boa NÃO cai no ramo degradado", () => {
    // Sem este controle negativo, "o ramo é alcançável" não distinguiria um algoritmo
    // que sempre degrada.
    for (const tema of [REGUA.claro, REGUA.escuro] as TemaDaRegua[]) {
      expect(escolherAccent(REGUA.rampaDoProduto, tema).motivo).toBeNull();
    }
  });
});
