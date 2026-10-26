/**
 * A DISTRIBUIÇÃO DE ATENDIMENTO, GUIADA: a tela, como o gerente a usa.
 *
 * Promessas desta tela, cada uma com o seu controle:
 *  1. a faixa "Quem recebe agora" diz quantos podem receber, quem é o próximo e avisa quando
 *     ninguém pode (o estado de uma instalação nova);
 *  2. a recomendação pelo tamanho da equipe aparece com o motivo e marca a opção, sem mudar o
 *     que está salvo;
 *  3. UM Salvar grava a distribuição e a assinatura, só o que mudou;
 *  4. "Mais ajustes" fecha o ajuste fino sem esconder o que está fora do padrão.
 *
 * As regras puras têm prova própria em `lib/routing/*.test.ts`; o formulário antigo segue
 * provado em `app/app/settings/atendimento/_form.test.tsx`.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AtendimentoForm, type AtendimentoConfig } from "@/app/app/settings/atendimento/_form";
import { QuemRecebeAgora } from "@/app/app/settings/atendimento/_quem-recebe-agora";
import { recomendacaoDeDistribuicao } from "@/lib/routing/recomendacao-de-distribuicao";
import type { SituacaoDaDistribuicao } from "@/lib/routing/situacao-da-distribuicao";

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  fetcher.mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  refresh.mockReset();
});

const inicial: AtendimentoConfig = {
  mode: "manual",
  max_retries: 5,
  backoff_seconds: 60,
  visibility_mode: "all",
  handoff_return_after_minutes: null,
  conversation_stays_with_attendant: false,
  manual_reply_silence_minutes: null,
};
const assinatura = { humanos: false, ia: false, nome_ia: "Assistente" };

const URLS = () => fetcher.mock.calls.map((c) => String(c[0]));

describe("faixa 'Quem recebe agora'", () => {
  const base: SituacaoDaDistribuicao = {
    pessoas: [
      { id: "ana", nome: "Ana", estado: "fora_do_horario", carga: 0 },
      { id: "bruno", nome: "Bruno", estado: "disponivel", carga: 1 },
      { id: "carla", nome: "Carla", estado: "disponivel", carga: 2 },
    ],
    disponiveis: 2,
    total: 3,
    proximoId: "bruno",
    fila: 1,
    esperaMediaSegundos: 130,
  };

  it("mostra quantos podem receber, o próximo da vez e a fila", () => {
    render(<QuemRecebeAgora situacao={base} modo="round_robin" />);
    expect(screen.getByTestId("podem-receber")).toHaveTextContent("2 de 3");
    expect(screen.getByTestId("pessoa-bruno")).toHaveAttribute("data-proximo", "sim");
    expect(screen.getByTestId("pessoa-ana")).toHaveTextContent("fora do horário");
    expect(screen.getByTestId("linha-da-fila")).toHaveTextContent("1 cliente na fila agora");
    expect(screen.getByTestId("linha-da-fila")).toHaveTextContent("o próximo cliente vai para Bruno");
    expect(screen.queryByTestId("aviso-ninguem-disponivel")).toBeNull();
  });

  it("em 'cada um pega' não promete ninguém como o próximo", () => {
    render(<QuemRecebeAgora situacao={{ ...base, proximoId: null }} modo="manual" />);
    expect(screen.getByTestId("linha-da-fila")).toHaveTextContent("ninguém recebe sozinho");
  });

  it("instalação nova: ninguém tem plantão e a tela explica o que acontece e onde resolver", () => {
    render(
      <QuemRecebeAgora
        situacao={{
          pessoas: [{ id: "ana", nome: "Ana", estado: "sem_plantao", carga: 0 }],
          disponiveis: 0,
          total: 1,
          proximoId: null,
          fila: 0,
          esperaMediaSegundos: 0,
        }}
        modo="round_robin"
      />,
    );
    const aviso = screen.getByTestId("aviso-ninguem-disponivel");
    expect(aviso).toHaveTextContent("Ninguém pode receber um cliente novo agora");
    expect(within(aviso).getByRole("link")).toHaveAttribute("href", "/app/team?aba=atendimento");
  });
});

describe("recomendação e um Salvar só", () => {
  it("a recomendação traz o motivo e marca a opção, sem mudar o que está salvo", () => {
    render(
      <AtendimentoForm
        initial={inicial}
        assinatura={assinatura}
        recomendacao={{ ...recomendacaoDeDistribuicao(3), total: 3 }}
      />,
    );
    expect(screen.getByTestId("recomendado-modo")).toHaveTextContent("Motivo: ninguém escolhe");
    expect(within(screen.getByTestId("opcao-modo-round_robin")).getByTestId("selo-recomendado")).toBeVisible();
    expect(within(screen.getByTestId("opcao-modo-manual")).queryByTestId("selo-recomendado")).toBeNull();
    // O salvo continua "cada um pega".
    expect(screen.getByTestId("opcao-modo-manual")).toHaveAttribute("data-marcada", "sim");
  });

  it("mudou a distribuição e a assinatura: um clique grava as duas, na ordem", async () => {
    render(<AtendimentoForm initial={inicial} assinatura={assinatura} />);
    fireEvent.click(screen.getByTestId("opcao-modo-round_robin"));
    fireEvent.click(screen.getByTestId("assinatura-humanos"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(URLS()).toEqual(["/api/v1/settings/routing", "/api/v1/settings/assinatura"]);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ humanos: true, ia: false, nome_ia: "Assistente" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("mudou só a assinatura: não regrava a distribuição", async () => {
    render(<AtendimentoForm initial={inicial} assinatura={assinatura} />);
    fireEvent.click(screen.getByTestId("assinatura-ia"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(URLS()).toEqual(["/api/v1/settings/assinatura"]);
  });

  it("sem mudança o Salvar fica desligado; 'Descartar alterações' volta ao salvo", () => {
    render(<AtendimentoForm initial={inicial} assinatura={assinatura} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("opcao-modo-load"));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect(screen.getByTestId("opcao-modo-manual")).toHaveAttribute("data-marcada", "sim");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});

describe("'Mais ajustes'", () => {
  it("fechado por padrão, e o contador diz quando algo está fora do padrão", () => {
    render(<AtendimentoForm initial={inicial} assinatura={assinatura} />);
    expect(screen.getByTestId("mais-ajustes")).not.toHaveAttribute("open");
    expect(screen.getByTestId("mais-ajustes-contagem")).toHaveTextContent("valores padrão");
  });

  it("ligar um ajuste atualiza a contagem sem abrir a seção", () => {
    render(<AtendimentoForm initial={inicial} assinatura={assinatura} />);
    fireEvent.click(screen.getByTestId("fica-com-quem-atendeu"));
    expect(screen.getByTestId("mais-ajustes-contagem")).toHaveTextContent("1 fora do padrão");
    fireEvent.click(screen.getByTestId("assinatura-ia"));
    expect(screen.getByTestId("mais-ajustes-contagem")).toHaveTextContent("2 fora do padrão");
    expect(screen.getByTestId("mais-ajustes")).not.toHaveAttribute("open");
  });

  it("'só os seus' com 'cada um pega' marca a parte para revisar e mostra o aviso", () => {
    render(<AtendimentoForm initial={{ ...inicial, visibility_mode: "own" }} />);
    expect(screen.getByTestId("aviso-combinacao-morta")).toBeVisible();
    expect(screen.getAllByTestId("selo-revisar")).toHaveLength(1);
  });
});
