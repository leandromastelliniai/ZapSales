/**
 * O que a PESSOA vê e faz com um material do tipo SITE (issue #93).
 *
 * Cadastrar: escolher "Site", colar os endereços (um por linha) e enviar — o tipo e a lista
 * chegam à API como foram digitados, e não há campo de arquivo nem de texto colado, porque
 * ninguém cola conteúdo num site. Acompanhar: o estado de cada página, com o motivo quando
 * falhou, sem abrir o banco. Reler: um botão, nunca um agendamento.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toastErro = vi.fn();
const toastOk = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastOk(m),
    error: (m: string) => toastErro(m),
    info: (m: string) => toastOk(m),
  },
}));

import { NovoMaterialDialog } from "@/components/ai/NovoMaterialDialog";
import { PaginasDoSiteDialog } from "@/components/ai/PaginasDoSiteDialog";
import { KnowledgeSourceCard } from "@/components/ai/KnowledgeSourceCard";
import type { SourceRow } from "@/hooks/ai/useKnowledgeSources";

function comQuery(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const PAGINAS = [
  {
    id: "p1", url: "https://loja.com.br/planos", position: 0, status: "lida", error_code: null, error_message: null,
    title: "Planos e preços", content_hash: "h", chunks_count: 3, last_read_at: "2026-10-17T12:00:00Z", last_changed_at: "2026-10-16T12:00:00Z",
  },
  {
    id: "p2", url: "https://loja.com.br/troca", position: 1, status: "falhou", error_code: "resposta_http",
    error_message: "O site respondeu 404.", title: null, content_hash: null, chunks_count: 0, last_read_at: "2026-10-17T12:00:00Z", last_changed_at: null,
  },
  {
    id: "p3", url: "https://loja.com.br/nova", position: 2, status: "pendente", error_code: null, error_message: null,
    title: null, content_hash: null, chunks_count: 0, last_read_at: null, last_changed_at: null,
  },
];

function materialDeSite(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "ks-site", agent_id: null, organization_id: "org-1", source_type: "site", name: "Site da Loja", status: "ready",
    last_index_status: "partial", last_index_error: "1 de 3 páginas do site não foram lidas — veja o motivo de cada uma em “Ver as páginas”.",
    last_indexed_at: new Date().toISOString(), chunks_count: 3, is_active: true, source_metadata: {},
    active_kb_version_id: "kbv-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
  };
}

beforeEach(() => {
  toastErro.mockReset();
  toastOk.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NovoMaterialDialog — material do tipo site", () => {
  function abrir() {
    return comQuery(<NovoMaterialDialog aberto onFechar={() => {}} onCriado={() => {}} podeIndexar />);
  }

  it("escolher Site troca o conteúdo pedido: lista de endereços, sem arquivo e sem texto colado", () => {
    abrir();
    expect(screen.queryByTestId("material-enderecos")).toBeNull();

    fireEvent.click(screen.getByTestId("material-tipo-site"));

    expect(screen.getByTestId("material-enderecos")).toBeTruthy();
    expect(screen.queryByTestId("material-arquivo")).toBeNull();
    expect(screen.queryByTestId("material-conteudo")).toBeNull();
  });

  it("envia source_type 'site' e a lista de endereços, um por linha, sem as vazias", async () => {
    const spy = vi.fn(async (_u: string, _i?: RequestInit) => json({ data: { id: "ks-1" } }, 201));
    vi.stubGlobal("fetch", spy);
    abrir();

    fireEvent.click(screen.getByTestId("material-tipo-site"));
    fireEvent.change(screen.getByTestId("material-nome"), { target: { value: "Site da Loja" } });
    fireEvent.change(screen.getByTestId("material-enderecos"), {
      target: { value: "https://loja.com.br/planos\n\n  https://loja.com.br/troca  \n" },
    });
    fireEvent.click(screen.getByTestId("material-criar"));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/ai/knowledge/sources");
    expect(JSON.parse(String(init?.body))).toEqual({
      source_type: "site",
      name: "Site da Loja",
      urls: ["https://loja.com.br/planos", "https://loja.com.br/troca"],
    });
  });

  it("sem nenhum endereço, avisa e não envia nada", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    abrir();

    fireEvent.click(screen.getByTestId("material-tipo-site"));
    fireEvent.change(screen.getByTestId("material-nome"), { target: { value: "Site vazio" } });
    fireEvent.click(screen.getByTestId("material-criar"));

    expect(toastErro).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("PaginasDoSiteDialog — o estado de cada página", () => {
  function abrir(extra: { onReler?: () => void } = {}) {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: PAGINAS })));
    return comQuery(
      <PaginasDoSiteDialog sourceId="ks-site" nome="Site da Loja" aberto onFechar={() => {}} onReler={extra.onReler ?? (() => {})} />,
    );
  }

  it("mostra cada página com o estado, e o MOTIVO de quem falhou", async () => {
    abrir();

    await waitFor(() => expect(screen.getByTestId("site-pagina-0")).toBeTruthy());
    expect(screen.getByTestId("site-pagina-estado-0").textContent).toBe("Lida");
    expect(screen.getByTestId("site-pagina-0").textContent).toContain("Planos e preços");
    expect(screen.getByTestId("site-pagina-estado-1").textContent).toBe("Não foi lida");
    expect(screen.getByTestId("site-pagina-motivo-1").textContent).toContain("O site respondeu 404.");
    expect(screen.getByTestId("site-pagina-estado-2").textContent).toBe("Aguardando leitura");
    expect(screen.queryByTestId("site-pagina-motivo-2")).toBeNull();
  });

  it("o campo de endereços já vem com a lista atual", async () => {
    abrir();
    await waitFor(() => expect((screen.getByTestId("site-enderecos") as HTMLTextAreaElement).value).toContain("https://loja.com.br/troca"));
    expect((screen.getByTestId("site-enderecos") as HTMLTextAreaElement).value.split("\n")).toEqual([
      "https://loja.com.br/planos",
      "https://loja.com.br/troca",
      "https://loja.com.br/nova",
    ]);
  });

  it("editar a lista habilita 'Salvar' e desabilita 'Ler de novo' até salvar; salvar envia PATCH com urls", async () => {
    const spy = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json({ data: { id: "ks-site" } }) : json({ data: PAGINAS }),
    );
    vi.stubGlobal("fetch", spy);
    comQuery(<PaginasDoSiteDialog sourceId="ks-site" nome="Site da Loja" aberto onFechar={() => {}} onReler={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("site-pagina-0")).toBeTruthy());

    const salvar = screen.getByTestId("site-salvar-enderecos") as HTMLButtonElement;
    const reler = screen.getByTestId("site-reler") as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    expect(reler.disabled).toBe(false);

    fireEvent.change(screen.getByTestId("site-enderecos"), { target: { value: "https://loja.com.br/planos\nhttps://loja.com.br/contato" } });
    expect(salvar.disabled).toBe(false);
    expect(reler.disabled).toBe(true);

    fireEvent.click(salvar);
    await waitFor(() => expect(spy.mock.calls.some(([, i]) => i?.method === "PATCH")).toBe(true));
    const patch = spy.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    expect(String(patch[0])).toContain("/api/v1/ai/knowledge/sources/ks-site");
    expect(JSON.parse(String(patch[1]?.body))).toEqual({
      urls: ["https://loja.com.br/planos", "https://loja.com.br/contato"],
    });
  });

  it("'Ler o site de novo' chama o re-treino manual", async () => {
    const onReler = vi.fn();
    abrir({ onReler });
    await waitFor(() => expect(screen.getByTestId("site-pagina-0")).toBeTruthy());
    fireEvent.click(screen.getByTestId("site-reler"));
    expect(onReler).toHaveBeenCalledTimes(1);
  });
});

describe("KnowledgeSourceCard — material do tipo site", () => {
  function cartao(source: SourceRow) {
    return comQuery(
      <KnowledgeSourceCard source={source} usadoPor={["Agente de vendas"]} onReindex={() => {}} onArquivar={() => {}} onMudou={() => {}} />,
    );
  }

  it("diz 'Ler o site de novo' (e não 'Preparar de novo'), oferece as páginas e mostra por que entrou pela metade", () => {
    cartao(materialDeSite());
    expect(screen.getByTestId("material-reindexar-ks-site").textContent).toContain("Ler o site de novo");
    expect(screen.getByTestId("material-paginas-ks-site")).toBeTruthy();
    expect(screen.getByTestId("material-ks-site").textContent).toContain("Entrou pela metade");
    expect(screen.getByTestId("material-ks-site").textContent).toContain("1 de 3 páginas do site não foram lidas");
  });

  it("não há editor de pergunta/resposta num site", () => {
    cartao(materialDeSite());
    expect(screen.queryByTestId("material-editar-ks-site")).toBeNull();
  });

  it("um material que NÃO é site segue como era: 'Preparar de novo', sem 'Ver as páginas'", () => {
    cartao(materialDeSite({ id: "ks-faq", source_type: "faq", last_index_status: "success", last_index_error: null }));
    expect(screen.getByTestId("material-reindexar-ks-faq").textContent).toContain("Preparar de novo");
    expect(screen.queryByTestId("material-paginas-ks-faq")).toBeNull();
  });
});
