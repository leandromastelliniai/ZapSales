import { logger } from "@/lib/logger";

/**
 * Acima disto o layout registra o próprio tempo. O `Server-Timing` é escrito pelo
 * `proxy` ANTES da renderização e um layout não acrescenta cabeçalho à resposta já
 * em streaming, então o tempo desta etapa vive no log do servidor (#65). Só a
 * navegação lenta é registrada: uma linha por clique seria ruído.
 */
export const LAYOUT_LENTO_MS = 300;

/**
 * Começa a medir e devolve o "fim": chamá-lo registra a linha quando passou do
 * limite. Mora fora do componente porque a regra de pureza do React proíbe
 * `performance.now()` direto no corpo de um componente.
 */
export function medirLayout(): () => void {
  const inicio = performance.now();
  return () => {
    const duracaoMs = performance.now() - inicio;
    if (duracaoMs >= LAYOUT_LENTO_MS) {
      logger.warn("[layout] renderização lenta", { etapa: "layout", dur_ms: Math.round(duracaoMs) });
    }
  };
}
