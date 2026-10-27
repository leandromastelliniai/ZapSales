"use client";

import { useEffect, useState } from "react";

import type { EstadoDoLigavel, EstadoDosMapas } from "@/lib/ia/resumo-da-ia";

/**
 * O que a faixa "Sua IA" precisa saber dos ajudantes opcionais que NÃO são o Jev: se a resposta em
 * áudio está ligada e se há chave de Mapas. Cada cartão lê a sua própria rota para se desenhar; esta
 * leitura é só do resumo, de propósito separada, para a faixa não depender de o cartão ter montado.
 *
 * Falha de leitura é `desconhecido`, nunca "desligado": a faixa diz que não conseguiu ler em vez de
 * afirmar o que não sabe. Cada resposta é conferida pelo FORMATO (um booleano onde deveria haver um),
 * porque uma rota que devolve outra coisa não pode virar "ligado" por acidente.
 */
export interface AjudantesOpcionais {
  audio: EstadoDoLigavel;
  mapas: EstadoDosMapas;
}

async function ler(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const corpo = (await res.json()) as { data?: unknown };
    return corpo.data ?? null;
  } catch {
    return null;
  }
}

export function useAjudantesOpcionais(): AjudantesOpcionais {
  const [estado, setEstado] = useState<AjudantesOpcionais>({ audio: "desconhecido", mapas: "desconhecido" });

  useEffect(() => {
    let vivo = true;
    void Promise.all([ler("/api/v1/ai/audio"), ler("/api/v1/ai/mapas")]).then(([audio, mapas]) => {
      if (!vivo) return;
      const ligado = (audio as { config?: { ligado?: unknown } } | null)?.config?.ligado;
      const configurada = (mapas as { configurada?: unknown } | null)?.configurada;
      setEstado({
        audio: typeof ligado === "boolean" ? (ligado ? "ligado" : "desligado") : "desconhecido",
        mapas: typeof configurada === "boolean" ? (configurada ? "com_chave" : "sem_chave") : "desconhecido",
      });
    });
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
