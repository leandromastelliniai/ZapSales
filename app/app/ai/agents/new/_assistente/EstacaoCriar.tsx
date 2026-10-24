"use client";
/**
 * Estação 5 — revisar e criar. Mostra o que será criado, em palavras, e cria o agente
 * como RASCUNHO pela mesma ação do editor completo; o teste real acontece na tela do
 * agente, que abre logo depois na aba "Teste". Sem chave de IA (ou sem modelo) a
 * estação explica o que falta e leva a quem resolve — as respostas ficam guardadas.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { fraseDoQueFaz } from "@/lib/ai/agents/o-que-o-modelo-faz";
import type { AgenteComposto } from "@/lib/ai/agents/assistente/compor";
import { ramoPorId } from "@/lib/ai/agents/assistente/ramos";
import type { EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";
import { MODELOS_DE_AGENTE } from "@/lib/ai/agents/modelos";
import type { PadroesDeIa } from "@/lib/ai/agents/padroes-de-ia";
import type { IdiomaDoAgente, TomDoAgente } from "@/lib/ai/agents/perfil";

interface Props {
  estado: EstadoDoAssistente;
  idioma: IdiomaDoAgente;
  agente: AgenteComposto;
  padroes: PadroesDeIa;
  criando: boolean;
  mudar: (e: EstadoDoAssistente) => void;
  criar: () => void;
}

const NOME_DO_TOM: Record<TomDoAgente, string> = {
  formal: "Formal",
  normal: "Normal",
  descontraido: "Descontraído",
};

export function EstacaoCriar({ estado, idioma, agente, padroes, criando, mudar, criar }: Props) {
  const t = useT();
  const r = estado.respostas;
  const ramo = r.ramoId ? ramoPorId(r.ramoId) : undefined;
  const modelo = MODELOS_DE_AGENTE.find((m) => m.id === r.modeloId)!.conteudo[idioma];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("Tudo pronto para criar")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "O agente nasce como rascunho e não atende ninguém ainda. Você testa em seguida e só publica quando quiser.",
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assistente-nome">{t("Nome do agente")}</Label>
        <Input
          id="assistente-nome"
          value={estado.nome}
          maxLength={120}
          placeholder={agente.name}
          autoComplete="off"
          onChange={(e) => mudar({ ...estado, nome: e.target.value })}
        />
      </div>

      <dl
        className="divide-y divide-border rounded-lg border border-border text-sm"
        data-testid="resumo-do-agente"
      >
        {[
          [
            t("Negócio"),
            [ramo ? ramo.nome[idioma] : t("Outro"), r.negocio.trim()].filter(Boolean).join(" · "),
          ],
          [t("O que faz"), modelo.titulo],
          [t("Como fala"), t(NOME_DO_TOM[r.tom])],
          [t("Na prática"), fraseDoQueFaz(r.modeloId, idioma)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-wrap gap-x-4 gap-y-0.5 px-3 py-2">
            <dt className="w-32 shrink-0 text-muted-foreground">{rotulo}</dt>
            <dd className="min-w-0 flex-1">{valor}</dd>
          </div>
        ))}
      </dl>

      {padroes.ok ? (
        <Button
          type="button"
          size="lg"
          disabled={criando}
          onClick={criar}
          data-testid="criar-agente"
        >
          {criando ? t("Criando…") : t("Criar e testar")}
        </Button>
      ) : (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-border bg-funil-fundo px-4 py-3 text-sm"
          data-testid="falta-de-ia"
        >
          <p className="font-medium text-funil">
            {padroes.motivo === "sem_modelo"
              ? t("Ainda não há um modelo de inteligência artificial disponível.")
              : padroes.chaveEmVerificacao
                ? t("A chave de acesso que você colou ainda está sendo confirmada.")
                : t("Falta a chave de acesso da inteligência artificial.")}
          </p>
          <p className="text-muted-foreground">
            {padroes.motivo === "sem_modelo"
              ? t(
                  "Cadastre a chave em Chaves de acesso à IA e aguarde a lista de modelos carregar. Suas respostas ficam guardadas.",
                )
              : t(
                  "O agente precisa dela para responder. Cadastre em Chaves de acesso à IA e volte: suas respostas ficam guardadas.",
                )}
          </p>
          <Button asChild variant="outline">
            <Link href="/app/ai/credentials">{t("Abrir Chaves de acesso à IA")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
