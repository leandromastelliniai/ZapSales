/**
 * O USO DECLARADO de um número — o que o administrador diz que ele faz.
 *
 * Cada número conectado é uma sessão de canal com um provedor e um uso
 * (spec, issue #1, "Canais"): `atendimento` (receber e responder), `campanha`
 * (disparo em massa) ou `ambos`. É uma DECLARAÇÃO, não uma trava: o motor de
 * campanhas lê o uso para orientar quem dispara (e avisar do risco de banimento
 * num número WAHA), mas quem decide é a pessoa.
 *
 * O vocabulário é FECHADO e nosso — por isso a coluna tem CHECK no banco (0536)
 * e esta lista é a mesma do CHECK. `null` na coluna = ainda não declarado (canal
 * conectado antes da 0536); a tela pede a declaração em vez de inventar uma.
 */
import { z } from "zod";

export const USOS_DO_NUMERO = ["atendimento", "campanha", "ambos"] as const;

export type UsoDoNumero = (typeof USOS_DO_NUMERO)[number];

export const usoDoNumeroSchema = z.enum(USOS_DO_NUMERO);

/** Lê a coluna sem confiar nela: valor fora do vocabulário vira "não declarado". */
export function lerUsoDoNumero(valor: unknown): UsoDoNumero | null {
  const lido = usoDoNumeroSchema.safeParse(valor);
  return lido.success ? lido.data : null;
}
