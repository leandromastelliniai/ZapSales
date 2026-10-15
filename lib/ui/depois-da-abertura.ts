import { useEffect, useState } from "react";

/**
 * Quanto esperar, depois que a tela monta, para pedir o que NÃO aparece nela.
 *
 * A Inbox abre com ~15 chamadas de API ao mesmo tempo (#66). Mais de uma delas é
 * do casco do app e nada tem a ver com o que a pessoa está olhando (som de
 * notificação, aviso de versão nova, sinal de presença). Pedir tudo junto
 * disputa o servidor com as chamadas que PREENCHEM a tela; pedir um instante
 * depois tira essas da frente sem a pessoa notar nada.
 *
 * Tempo fixo, e não `requestIdleCallback`, de propósito: enquanto o navegador
 * espera a rede ele está ocioso, e o callback de ociosidade dispararia quase na
 * hora — exatamente dentro da rajada que se quer evitar.
 */
export const ATRASO_DA_ABERTURA_MS = 1500;

/** Roda `fn` uma vez, depois da abertura. Devolve o cancelamento. */
export function depoisDaAbertura(fn: () => void, atrasoMs: number = ATRASO_DA_ABERTURA_MS): () => void {
  const id = setTimeout(fn, atrasoMs);
  return () => clearTimeout(id);
}

/** `false` na montagem e `true` depois da abertura — para ligar um `enabled`. */
export function useDepoisDaAbertura(atrasoMs: number = ATRASO_DA_ABERTURA_MS): boolean {
  const [pronto, setPronto] = useState(false);
  useEffect(() => depoisDaAbertura(() => setPronto(true), atrasoMs), [atrasoMs]);
  return pronto;
}
