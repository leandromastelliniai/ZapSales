import { describe, expect, it } from "vitest";

import {
  decidirSePedeAprovacao,
  estadoEfetivoDoPedido,
  fraseDoEstadoParaOAgente,
  resumoDosDados,
  tituloDoAviso,
} from "./aprovacao";
import { hashDosArgumentos } from "./impressao-digital";

describe("decidirSePedeAprovacao — nada altera o mundo sem aprovação por padrão", () => {
  it("ação que altera pede aprovação quando a chave nunca foi tocada (padrão seguro)", () => {
    expect(decidirSePedeAprovacao({ effect: "altera", requireApproval: null, modo: "ao_vivo" })).toEqual({
      pede: true,
      porque: "padrao_do_efeito",
    });
  });

  it("consulta roda direto quando a chave nunca foi tocada", () => {
    expect(decidirSePedeAprovacao({ effect: "consulta", requireApproval: null, modo: "ao_vivo" })).toEqual({
      pede: false,
      porque: null,
    });
  });

  it("a pessoa que cadastra pode desligar a chave numa ação que altera, e ligar numa consulta", () => {
    expect(decidirSePedeAprovacao({ effect: "altera", requireApproval: false, modo: "ao_vivo" }).pede).toBe(false);
    expect(decidirSePedeAprovacao({ effect: "consulta", requireApproval: true, modo: "ao_vivo" })).toEqual({
      pede: true,
      porque: "chave_da_ferramenta",
    });
  });

  it("modo Assistido: TODA ferramenta externa espera, qualquer que seja a chave", () => {
    for (const effect of ["consulta", "altera"] as const) {
      for (const requireApproval of [null, true, false]) {
        expect(
          decidirSePedeAprovacao({ effect, requireApproval, modo: "assistido" }),
          `${effect}/${requireApproval}`,
        ).toEqual({ pede: true, porque: "modo_assistido" });
      }
    }
  });
});

describe("resumoDosDados — o que a Central e a auditoria mostram, sem segredos", () => {
  it("lista campo e valor, corta o que é longo e preserva a ordem", () => {
    const r = resumoDosDados({ produto: "camiseta azul", observacao: "x".repeat(300) });
    expect(r[0]).toEqual({ campo: "produto", valor: "camiseta azul" });
    expect(r[1]!.campo).toBe("observacao");
    expect(r[1]!.valor.length).toBeLessThanOrEqual(81);
    expect(r[1]!.valor.endsWith("…")).toBe(true);
  });

  it("esconde o valor de campo que parece segredo", () => {
    const r = resumoDosDados({ senha: "123456", api_token: "abc", chave_de_acesso: "k", cliente: "Ana" });
    expect(r.filter((l) => l.campo !== "cliente").map((l) => l.valor)).toEqual(["•••", "•••", "•••"]);
    expect(r.find((l) => l.campo === "cliente")!.valor).toBe("Ana");
  });

  it("esconde também documento, cartão e códigos de uso único (a auditoria guarda 5 anos)", () => {
    const r = resumoDosDados({ cpf: "123.456.789-00", cvv: "123", pin: "9999", codigo_otp: "551122", numero_do_cartao: "4111", nome: "Ana" });
    expect(r.filter((l) => l.campo !== "nome").every((l) => l.valor === "•••")).toBe(true);
    expect(r.find((l) => l.campo === "nome")!.valor).toBe("Ana");
  });

  it("ignora campo ausente e mostra booleano e número como texto", () => {
    expect(resumoDosDados({ a: undefined, b: true, c: 3 })).toEqual([
      { campo: "b", valor: "sim" },
      { campo: "c", valor: "3" },
    ]);
  });
});

describe("hashDosArgumentos — a mesma chamada tem sempre a mesma impressão digital", () => {
  it("não depende da ordem dos campos", () => {
    expect(hashDosArgumentos({ a: 1, b: "x" })).toBe(hashDosArgumentos({ b: "x", a: 1 }));
  });
  it("muda quando um dado muda, e ignora campo ausente", () => {
    expect(hashDosArgumentos({ a: 1 })).not.toBe(hashDosArgumentos({ a: 2 }));
    expect(hashDosArgumentos({ a: 1, b: undefined })).toBe(hashDosArgumentos({ a: 1 }));
  });
});

describe("estadoEfetivoDoPedido — pedido pendente vencido já é expirado, mesmo antes do cron", () => {
  const agora = new Date("2026-10-17T12:00:00Z");
  it("pendente dentro do prazo continua pendente", () => {
    expect(estadoEfetivoDoPedido({ status: "pending", expires_at: "2026-10-17T13:00:00Z" }, agora)).toBe("pending");
  });
  it("pendente vencido é expirado", () => {
    expect(estadoEfetivoDoPedido({ status: "pending", expires_at: "2026-10-17T11:59:59Z" }, agora)).toBe("expired");
  });
  it("estados finais não mudam com o relógio", () => {
    expect(estadoEfetivoDoPedido({ status: "executed", expires_at: "2020-01-01T00:00:00Z" }, agora)).toBe("executed");
  });
});

describe("fraseDoEstadoParaOAgente — o agente nunca afirma execução antes dela", () => {
  it("pendente: depende de confirmação, nada foi feito", () => {
    const f = fraseDoEstadoParaOAgente({ estado: "pending", incerto: false });
    expect(f).toMatch(/aguardando aprovação/i);
    expect(f).toMatch(/não foi (feita|executada|realizada)/i);
    expect(f).toMatch(/não afirme/i);
  });
  it("em execução: a ação está em voo — nem «aguardando aprovação» nem «feita»", () => {
    const f = fraseDoEstadoParaOAgente({ estado: "executing", incerto: false });
    expect(f).toMatch(/sendo executada agora/i);
    expect(f).toMatch(/não afirme que foi concluída/i);
    expect(f).not.toMatch(/aguardando aprovação/i);
  });
  it("executada: pode confirmar", () => {
    expect(fraseDoEstadoParaOAgente({ estado: "executed", incerto: false })).toMatch(/foi executada/i);
  });
  it("recusada e expirada: não foi feita e não deve ser prometida", () => {
    expect(fraseDoEstadoParaOAgente({ estado: "rejected", incerto: false })).toMatch(/recusad/i);
    expect(fraseDoEstadoParaOAgente({ estado: "expired", incerto: false })).toMatch(/expir/i);
    for (const estado of ["rejected", "expired"] as const) {
      expect(fraseDoEstadoParaOAgente({ estado, incerto: false })).toMatch(/não foi (feita|executada|realizada)/i);
    }
  });
  it("falha incerta: não afirma nem nega e não repete", () => {
    const f = fraseDoEstadoParaOAgente({ estado: "failed", incerto: true });
    expect(f).toMatch(/não foi possível confirmar/i);
    expect(f).toMatch(/não tente de novo/i);
  });
  it("falha certa: não foi feita", () => {
    expect(fraseDoEstadoParaOAgente({ estado: "failed", incerto: false })).toMatch(/não foi (feita|executada|realizada)/i);
  });
});

describe("tituloDoAviso", () => {
  it("leva o nome da ferramenta e a primeira informação, e pedidos iguais não colidem", () => {
    const a = tituloDoAviso("Criar pedido", { produto: "camiseta azul" }, "aaaa1111-0000-4000-8000-000000000000");
    const b = tituloDoAviso("Criar pedido", { produto: "camiseta azul" }, "bbbb2222-0000-4000-8000-000000000000");
    expect(a).toContain("Criar pedido");
    expect(a).toContain("camiseta azul");
    expect(a).not.toBe(b);
  });
});
