/**
 * O grupo "Ferramentas externas" do seletor de ferramentas do agente (issue #94).
 *
 * As ferramentas externas ocupam as MESMAS 27 vagas das capacidades do catálogo: o
 * consumo mostrado soma as duas listas, a recusa por teto vale para as duas, e uma
 * ferramenta desativada (ou que altera dados) só pode ser DESMARCADA. O grupo não
 * aparece para quem não passa `externas` (o papel Operador não as recebe).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ToolPicker } from "@/app/app/ai/agents/[id]/_components/ToolPicker";
import { passaDoTetoDeCapacidades } from "@/lib/ai/agents/validation";
import { TETO_TOOLS_POR_AGENTE, excedeuTeto, vagasRestantes } from "@/lib/mcp/tools/selecao-por-pacote";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

const CAPACIDADE = {
  id: "crm_search_contacts",
  description: "Busca contatos.",
  category: "read",
  requires_role: "viewer",
  requires_scope: "mcp:read",
  rotulo: "Buscar contatos",
  explicacao: "Encontra o contato certo.",
  o_que_toca: "Contatos",
  risco: "seguro",
  pacotes: ["atender"],
  marcavel: true,
  motivo_nao_marcavel: null,
};

const ATIVA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Consultar estoque",
  agent_name: "ext_consultar_estoque",
  when_to_use: "Quando o cliente perguntar se um produto está disponível.",
  url: "https://erp.exemplo.com.br/hooks/estoque",
  effect: "consulta",
  active: true,
};
const DESATIVADA = { ...ATIVA, id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Consultar preço", active: false };

let client: QueryClient;
let externas: Array<typeof ATIVA>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  externas = [ATIVA, DESATIVADA];
  api.get.mockReset();
  api.get.mockImplementation(async (url: string) =>
    url.includes("external-tools")
      ? { data: externas }
      : { data: { tools: [CAPACIDADE], desligadas_pela_organizacao: [] } },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
});

function abrir(props: { value?: string[]; externasMarcadas?: string[]; onExternas?: (ids: string[]) => void; semGrupo?: boolean }) {
  return render(
    <IdiomaProvider locale="pt-BR">
      <QueryClientProvider client={client}>
        <ToolPicker
          value={props.value ?? []}
          onChange={() => undefined}
          {...(props.semGrupo
            ? {}
            : { externas: { value: props.externasMarcadas ?? [], onChange: props.onExternas ?? (() => undefined) } })}
        />
      </QueryClientProvider>
    </IdiomaProvider>,
  );
}

describe("o teto de capacidades soma as duas listas", () => {
  it("vagas e excesso contam as ferramentas externas", () => {
    expect(vagasRestantes(["a", "b"], 3)).toBe(TETO_TOOLS_POR_AGENTE - 5);
    expect(excedeuTeto(Array(25).fill("x"), 2)).toBe(false);
    expect(excedeuTeto(Array(25).fill("x"), 3)).toBe(true);
    expect(passaDoTetoDeCapacidades(Array(26).fill("x"), ["a"])).toBe(false);
    expect(passaDoTetoDeCapacidades(Array(26).fill("x"), ["a", "b"])).toBe(true);
    expect(passaDoTetoDeCapacidades(["a"], undefined)).toBe(false);
  });
});

describe("ToolPicker — grupo Ferramentas externas", () => {
  it("lista as ferramentas cadastradas, com o 'quando usar' e o efeito", async () => {
    abrir({});
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${ATIVA.id}`)).toBeTruthy());
    const ativa = screen.getByTestId(`ferramenta-externa-${ATIVA.id}`);
    expect(ativa.textContent).toContain("Consultar estoque");
    expect(ativa.textContent).toContain("Quando o cliente perguntar se um produto está disponível.");
    expect(ativa.textContent).toContain("Só consulta");
    expect(ativa.textContent).toContain("erp.exemplo.com.br");
  });

  it("marcar uma devolve a lista nova, e o consumo soma com as capacidades do catálogo", async () => {
    const aoMudar = vi.fn();
    abrir({ value: ["crm_search_contacts"], externasMarcadas: [ATIVA.id], onExternas: aoMudar });
    await waitFor(() => expect(screen.getByTestId("grupo-ferramentas-externas")).toBeTruthy());
    expect(screen.getByTestId("consumo-teto").textContent).toContain(`2 de ${TETO_TOOLS_POR_AGENTE}`);
    // Desmarcar a que está marcada.
    fireEvent.click(await screen.findByRole("checkbox", { name: "Consultar estoque" }));
    expect(aoMudar).toHaveBeenCalledWith([]);
  });

  it("ferramenta DESATIVADA não pode ser ligada, e diz por quê", async () => {
    const aoMudar = vi.fn();
    abrir({ onExternas: aoMudar });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar preço" }) as HTMLInputElement;
    expect(caixa.disabled).toBe(true);
    expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`).textContent).toContain("Desativada");
  });

  it("a desativada que JÁ estava marcada pode ser desmarcada", async () => {
    const aoMudar = vi.fn();
    abrir({ externasMarcadas: [DESATIVADA.id], onExternas: aoMudar });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${DESATIVADA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar preço" }) as HTMLInputElement;
    expect(caixa.disabled).toBe(false);
    fireEvent.click(caixa);
    expect(aoMudar).toHaveBeenCalledWith([]);
  });

  it("com o teto cheio, ligar mais uma é recusado com o aviso do teto", async () => {
    const aoMudar = vi.fn();
    const cheio = Array.from({ length: TETO_TOOLS_POR_AGENTE }, (_, i) => `cap_${i}`);
    abrir({ value: cheio, onExternas: aoMudar });
    await waitFor(() => expect(screen.getByTestId(`ferramenta-externa-${ATIVA.id}`)).toBeTruthy());
    const caixa = screen.getByRole("checkbox", { name: "Consultar estoque" }) as HTMLInputElement;
    // Sem vaga, a caixa nem aceita ligar.
    expect(caixa.disabled).toBe(true);
    fireEvent.click(caixa);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("organização sem nenhuma ferramenta: diz o que fazer e aonde ir", async () => {
    externas = [];
    abrir({});
    await waitFor(() => expect(screen.getByTestId("sem-ferramentas-externas")).toBeTruthy());
    expect(screen.getByTestId("sem-ferramentas-externas").textContent).toContain("Você ainda não cadastrou nenhuma ferramenta externa.");
    const link = screen.getByRole("link", { name: "Cadastrar uma ferramenta externa" });
    expect(link.getAttribute("href")).toBe("/app/ai/external-tools");
  });

  it("ferramenta marcada que não existe mais é avisada e pode ser desmarcada", async () => {
    const aoMudar = vi.fn();
    abrir({ externasMarcadas: ["bbbbbbbb-0000-4000-8000-000000000009", ATIVA.id], onExternas: aoMudar });
    await waitFor(() => expect(screen.getByTestId("ferramentas-externas-orfas")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar" }));
    expect(aoMudar).toHaveBeenCalledWith([ATIVA.id]);
  });

  it("sem a prop `externas` (o papel Operador) o grupo nem aparece e a lista não é buscada", async () => {
    abrir({ semGrupo: true });
    await waitFor(() => expect(screen.getByTestId("tool-picker")).toBeTruthy());
    expect(screen.queryByTestId("grupo-ferramentas-externas")).toBeNull();
    expect(api.get.mock.calls.some(([url]) => String(url).includes("external-tools"))).toBe(false);
  });
});
