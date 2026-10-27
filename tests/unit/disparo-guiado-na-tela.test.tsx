/**
 * O DISPARO EM MASSA, GUIADO: a tela "Nova campanha", como quem configura a usa.
 *
 * Três promessas, cada uma com o seu controle:
 *  1. a faixa do topo responde quantas pessoas, por onde, quanto tempo e quanto custa, lendo o
 *     formulário a cada edição — e a contagem do público se refaz sozinha, sem apertar botão;
 *  2. "Vai disparar?" diz POR QUE o formulário ainda não está pronto, em vez de um botão cinza;
 *  3. o bloco do ritmo mostra o que o número já faz, recomenda com o motivo e avisa o que o que
 *     foi digitado não muda.
 *
 * As contas puras têm prova própria em `resumo-do-disparo.test.ts`. A frase "podem receber" NÃO
 * pode aparecer na faixa: a spec `disparo-em-massa-csv` localiza o botão "Ver quantas pessoas" pelo
 * texto ao lado dele e exige um único elemento.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { GuiaDoRitmo } from "@/components/campanhas/GuiaDoRitmo";
import { ResumoDoDisparo } from "@/components/campanhas/ResumoDoDisparo";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import {
  recomendarRitmo,
  type Conferencia,
  type RitmoDoNumero,
} from "@/lib/campanhas/resumo-do-disparo";

const NUMERO_NOVO: RitmoDoNumero = {
  intervaloSegundos: 1.2,
  janelaInicioHora: 7,
  janelaFimHora: 22,
  domingoLiberado: true,
  limiteDiario: null,
  aquecimento: PACING_DEFAULTS.warmupDailyCaps,
  idadeDias: 0,
};

const OK: Conferencia[] = [{ id: "numero", estado: "ok", motivo: "escolhido" }];

const BASE = {
  canalNome: "Loja",
  oficial: false,
  temCriterio: true,
  contando: false,
  elegiveis: 312 as number | null,
  excluidos: 18,
  duracao: { tipo: "dias", dias: 3, porDia: 120, limitadoPor: "teto_da_campanha", horasNaJanela: 15 } as const,
  custoCents: null,
  tetoDeGastoCents: null,
  conferencias: OK,
};

describe("faixa do topo", () => {
  it("responde as quatro perguntas sem escrever 'podem receber'", () => {
    const { container } = render(<ResumoDoDisparo {...BASE} />);
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("312 pessoas");
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("18 ficam de fora");
    expect(screen.getByTestId("resumo-disparo-onde")).toHaveTextContent("Loja");
    expect(screen.getByTestId("resumo-disparo-onde")).toHaveTextContent("QR code · texto livre");
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("3 dias");
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("Até 120 por dia");
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("limitado pelo teto da campanha");
    expect(screen.getByTestId("resumo-disparo-custo")).toHaveTextContent("Sem tarifa da Meta");
    expect(container.textContent).not.toMatch(/podem receber/);
  });

  it("antes de escolher o público, diz o que falta em vez de um zero", () => {
    render(<ResumoDoDisparo {...BASE} temCriterio={false} elegiveis={null} duracao={{ tipo: "sem_destinatarios" }} />);
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("Escolha o público");
  });

  it("enquanto conta, diz que está contando", () => {
    render(<ResumoDoDisparo {...BASE} elegiveis={null} contando />);
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("Contando…");
  });

  it("API Oficial mostra o custo estimado e o teto", () => {
    render(<ResumoDoDisparo {...BASE} oficial custoCents={14_000} tetoDeGastoCents={20_000} />);
    expect(screen.getByTestId("resumo-disparo-onde")).toHaveTextContent("API Oficial · modelo aprovado");
    expect(screen.getByTestId("resumo-disparo-custo")).toHaveTextContent("R$ 140,00");
    expect(screen.getByTestId("resumo-disparo-custo")).toHaveTextContent("R$ 200,00");
  });

  it("não chuta o tempo quando não leu o ritmo do número", () => {
    render(<ResumoDoDisparo {...BASE} duracao={null} />);
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("Sem ler o ritmo do número");
  });

  it("Vai disparar? abre as conferências por clique e conta as que pedem atenção", () => {
    const conferencias: Conferencia[] = [
      { id: "numero", estado: "atencao", motivo: "falta_escolher" },
      { id: "publico", estado: "atencao", motivo: "sem_criterio" },
      { id: "risco", estado: "info", motivo: "aceite_ao_iniciar" },
    ];
    render(<ResumoDoDisparo {...BASE} conferencias={conferencias} />);
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "atencao");
    expect(screen.getByTestId("vai-disparar-estado")).toHaveTextContent("2 pedem atenção");
    expect(screen.queryByTestId("conferencia-disparo-numero")).toBeNull();

    fireEvent.click(screen.getByTestId("vai-disparar-botao"));
    const numero = screen.getByTestId("conferencia-disparo-numero");
    expect(numero).toHaveTextContent("Escolha o número que vai enviar.");
    expect(within(screen.getByTestId("conferencia-disparo-risco")).getByText(/aviso de risco de banimento/)).toBeInTheDocument();
  });

  it("tudo certo quando nada pede atenção", () => {
    render(<ResumoDoDisparo {...BASE} />);
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "ok");
  });
});

describe("guia do ritmo", () => {
  it("número novo: diz o que ele já faz, o teto de hoje e recomenda deixar em branco, com o motivo", () => {
    render(
      <GuiaDoRitmo
        oficial={false}
        numero={NUMERO_NOVO}
        recomendacao={recomendarRitmo({ oficial: false, temTetoDeGasto: false, numero: NUMERO_NOVO })}
        avisos={[]}
      />,
    );
    const feito = screen.getByTestId("ritmo-do-numero");
    expect(feito).toHaveTextContent("intervalo mínimo entre mensagens 1,2 s");
    expect(feito).toHaveTextContent("horário de envio 7h–22h");
    expect(feito).toHaveTextContent("aquecimento hoje: 20 por dia");
    const recomendado = screen.getByTestId("recomendacao-do-ritmo");
    expect(recomendado).toHaveTextContent("deixe o ritmo em branco");
    expect(recomendado).toHaveTextContent("sobe para 50 em 4 dias");
    expect(recomendado).toHaveTextContent(/Motivo: .*banido/);
  });

  it("API Oficial: sem intervalo nem aquecimento, e recomenda o teto de gasto quando falta", () => {
    render(
      <GuiaDoRitmo
        oficial
        numero={NUMERO_NOVO}
        recomendacao={recomendarRitmo({ oficial: true, temTetoDeGasto: false, numero: NUMERO_NOVO })}
        avisos={[]}
      />,
    );
    expect(screen.getByTestId("ritmo-do-numero")).not.toHaveTextContent("intervalo mínimo");
    expect(screen.getByTestId("ritmo-do-numero")).not.toHaveTextContent("aquecimento");
    expect(screen.getByTestId("recomendacao-do-ritmo")).toHaveTextContent("defina um teto de gasto");
  });

  it("mostra os avisos do que foi digitado e some quando o ritmo do número não foi lido", () => {
    const { container, rerender } = render(
      <GuiaDoRitmo
        oficial={false}
        numero={NUMERO_NOVO}
        recomendacao={{ tipo: "formado" }}
        avisos={[{ id: "teto_acima_do_numero", limite: 100 }]}
      />,
    );
    expect(screen.getByTestId("avisos-do-ritmo")).toHaveTextContent("O limite do número é 100 por dia");
    rerender(<GuiaDoRitmo oficial={false} numero={null} recomendacao={null} avisos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── A página inteira ─────────────────────────────────────────────────────────────────────────

const chamadasDaPrevia: Array<Record<string, unknown>> = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string | null }) => c.display_name ?? "Número sem nome",
  useChannelSessions: () => ({ data: [{ id: "c1", display_name: "Loja", phone_number: null, waha_session_name: "x" }] }),
}));

vi.mock("@/hooks/channels/usePacingKnobs", () => ({
  usePacingKnobs: () => ({
    data: {
      items: [
        {
          channel_session: { id: "c1", daily_message_limit: 100 },
          effective: { ...PACING_DEFAULTS },
          warmup: { age_days: 0, skipped: false },
        },
      ],
    },
  }),
}));

vi.mock("@/hooks/campanhas/useDestinoDaCampanha", () => ({
  useFunis: () => ({ data: [] }),
  useEtapas: () => ({ data: [] }),
  useAgentesPublicados: () => ({ data: [] }),
}));

vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useCriarCampanha: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useModelosDaCampanha: () => ({ data: { oficial: false, modelos: [] }, isPending: false }),
  // Como o react-query: `mutate` e `reset` estáveis, e `data` zera quando uma contagem nova começa.
  usePreviaDaAudiencia: () => {
    const [data, setData] = useState<unknown>(undefined);
    const mutate = useCallback((corpo: Record<string, unknown>) => {
      chamadasDaPrevia.push(corpo);
      setData({ total: 330, elegiveis: 312, excluidos: 18, motivos: {}, amostra: [], legenda: {} });
    }, []);
    const reset = useCallback(() => setData(undefined), []);
    return { mutate, reset, data, isPending: false };
  },
}));

vi.mock("@/components/campanhas/SubirListaCsv", () => ({ SubirListaCsv: () => null }));
vi.mock("@/components/campanhas/RespostaDaCampanha", () => ({ RespostaDaCampanha: () => null }));

describe("Nova campanha", () => {
  beforeEach(() => {
    chamadasDaPrevia.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  async function montar() {
    const { NovaCampanha } = await import("@/app/app/campaigns/new/_client");
    render(<NovaCampanha />);
  }

  it("formulário vazio: a faixa diz o que falta e nada é contado", async () => {
    await montar();
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("Escolha o público");
    expect(screen.getByTestId("resumo-disparo-onde")).toHaveTextContent("Escolha o número");
    expect(screen.getByTestId("vai-disparar-estado")).toHaveTextContent("3 pedem atenção");
    act(() => void vi.advanceTimersByTime(2_000));
    expect(chamadasDaPrevia).toHaveLength(0);
  });

  it("mexer no público conta sozinho, uma vez, depois de uma pausa na digitação", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Enviar pelo número"), { target: { value: "c1" } });
    const campo = screen.getByLabelText("Com alguma destas etiquetas");
    fireEvent.change(campo, { target: { value: "v" } });
    act(() => void vi.advanceTimersByTime(300));
    fireEvent.change(campo, { target: { value: "vip" } });
    act(() => void vi.advanceTimersByTime(699));
    expect(chamadasDaPrevia).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(1));
    expect(chamadasDaPrevia).toHaveLength(1);
    expect((chamadasDaPrevia[0]!.audience_filter as { com_alguma_tag: string[] }).com_alguma_tag).toEqual(["vip"]);
    expect(screen.getByTestId("resumo-disparo-quem")).toHaveTextContent("312 pessoas");
    // Número novo, limite de 100/dia e 312 pessoas: 20/dia por 4 dias, 50/dia por 4, depois 100/dia
    // (o limite do número) — a conta simula o aquecimento subindo, dia a dia.
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("9 dias");
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("Até 20 por dia");
    expect(screen.getByTestId("resumo-disparo-tempo")).toHaveTextContent("limitado pelo aquecimento do número");
  });

  it("o bloco do ritmo mostra o que o número faz e avisa que teto acima do limite não adianta", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Enviar pelo número"), { target: { value: "c1" } });
    expect(screen.getByTestId("resumo-disparo-onde")).toHaveTextContent("Loja");
    expect(screen.getByTestId("ritmo-do-numero")).toHaveTextContent("limite do número: 100 por dia");
    expect(screen.getByTestId("recomendacao-do-ritmo")).toHaveTextContent("O número é novo");
    expect(screen.queryByTestId("avisos-do-ritmo")).toBeNull();

    fireEvent.change(screen.getByLabelText("Máximo por dia"), { target: { value: "500" } });
    expect(screen.getByTestId("avisos-do-ritmo")).toHaveTextContent("O limite do número é 100 por dia");
  });

  it("a base legal traz um exemplo de quando escolher cada uma", async () => {
    await montar();
    expect(screen.getByTestId("ajuda-base-legal")).toHaveTextContent(/Na dúvida, escolha consentimento/);
  });
});
