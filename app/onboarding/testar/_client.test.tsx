import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TestarClient } from "./_client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/app/actions/onboarding/marcarTeste", () => ({
  marcarTesteFeito: vi.fn(),
  pularTeste: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function responder(data: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) }),
  );
}

async function ensaiar() {
  render(<TestarClient nome="Ana" agenteId="a" versaoId="v" />);
  fireEvent.click(screen.getByRole("button", { name: /mandar mensagem/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TestarClient — desfecho do ensaio", () => {
  it('mostra a resposta quando a rota devolve status "ok"', async () => {
    responder({ status: "ok", final_text: "Olá! Hoje atendemos até as 18h." });
    await ensaiar();
    await waitFor(() => expect(screen.getByText(/atendemos até as 18h/)).toBeTruthy());
    expect(screen.queryByText(/não conseguiu responder/)).toBeNull();
  });

  it('mostra erro quando a rota devolve "blocked" (sem resposta candidata)', async () => {
    responder({ status: "blocked", final_text: "" });
    await ensaiar();
    await waitFor(() => expect(screen.getByText(/não conseguiu responder/)).toBeTruthy());
  });
});
