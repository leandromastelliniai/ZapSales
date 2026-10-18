import { createHash } from "node:crypto";

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonico(v)]),
    );
  }
  return valor;
}

/**
 * A impressão digital dos dados: a mesma chamada (mesmos campos, mesmos valores, em qualquer
 * ordem) tem sempre o mesmo hash. É com ela que o banco reconhece que o modelo REPETIU o
 * pedido — repetição não abre um segundo pedido nem executa duas vezes.
 */
export function hashDosArgumentos(argumentos: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonico(argumentos))).digest("hex");
}
