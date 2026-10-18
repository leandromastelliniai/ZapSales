/**
 * O PASSO "CONFIGURAR IA" DO ONBOARDING COM MODELOS POR RAMO (issue #92) — a tela.
 *
 * Promessas da tela, cada uma com o seu controle:
 *  1. o passo de sempre NÃO muda: sem escolher ramo, o envio leva o "jeito de falar"
 *     e `ramo` vazio — o que a action lê como "sem modelo";
 *  2. escolher um ramo envia `ramo` e o idioma da tela, e esconde o jeito de falar
 *     (o modelo já define o tom), que segue indo no envio (oculto);
 *  3. voltar para "nenhum" traz o jeito de falar de volta;
 *  4. os cards vêm no idioma da tela.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { CreateAgentResult } from "@/app/actions/onboarding/createDefaultAgent";

const enviado = vi.fn<(fd: FormData) => Promise<CreateAgentResult>>();
vi.mock("@/app/actions/onboarding/createDefaultAgent", () => ({
  createDefaultAgent: (fd: FormData) => enviado(fd),
  skipAi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { SetupAiForm } from "@/app/onboarding/setup-ai/_form";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

function montar(locale: string | null = null) {
  return render(
    <IdiomaProvider locale={locale}>
      <SetupAiForm capacidades={["Ver os clientes"]} conferencias={["Respeitar quem pediu para parar"]} />
    </IdiomaProvider>,
  );
}

async function enviar(): Promise<FormData> {
  fireEvent.click(await screen.findByRole("button", { name: /criar e continuar|crear y continuar/i }));
  await waitFor(() => expect(enviado).toHaveBeenCalled());
  return enviado.mock.calls[0]![0];
}

afterEach(() => {
  cleanup();
  enviado.mockReset();
  enviado.mockResolvedValue({ ok: true, agent_id: "a1", publish_error: "x" });
});

describe("onboarding: ramo do atendimento (#92)", () => {
  it("sem escolher ramo, o envio é o de sempre: jeito de falar e ramo vazio (controle)", async () => {
    enviado.mockResolvedValue({ ok: true, agent_id: "a1", publish_error: "x" });
    montar();
    expect(screen.getByTestId("onboarding-ramo-nenhum")).toBeChecked();
    const fd = await enviar();
    expect(fd.get("prompt_template")).toBe("ecommerce_friendly");
    expect(fd.get("ramo")).toBe("");
  });

  it("escolher um ramo envia o ramo e o idioma da tela (o jeito de falar sai de cena no teste seguinte)", async () => {
    enviado.mockResolvedValue({ ok: true, agent_id: "a1", publish_error: "x" });
    montar("es");
    fireEvent.click(screen.getByTestId("onboarding-ramo-suporte"));
    const fd = await enviar();
    expect(fd.get("ramo")).toBe("suporte");
    expect(fd.get("idioma")).toBe("es");
    // O campo oculto mantém o envio sempre igual.
    expect(fd.get("prompt_template")).toBe("ecommerce_friendly");
  });

  it("voltar para 'nenhum' traz o jeito de falar de volta", () => {
    montar();
    fireEvent.click(screen.getByTestId("onboarding-ramo-vendas"));
    expect(screen.getByText("O jeito dele falar")).not.toBeVisible();
    fireEvent.click(screen.getByTestId("onboarding-ramo-nenhum"));
    expect(screen.getByText("O jeito dele falar")).toBeVisible();
  });

  it("os três ramos aparecem, no idioma da tela", () => {
    montar("es");
    const fieldset = screen.getByTestId("onboarding-ramo");
    expect(fieldset).toHaveTextContent("Ventas");
    expect(fieldset).toHaveTextContent("Soporte");
    expect(fieldset).toHaveTextContent("Agendamiento");
  });
});
