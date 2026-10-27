"use client";
/**
 * "Sua IA" e "Está tudo certo?", numa faixa no topo de Provedores de IA.
 *
 * Quatro respostas que quem abre a tela quer antes de mexer em qualquer seletor — quem conversa com o
 * cliente, de onde vem a chave, em quantas partes do sistema o padrão vale e quantos ajudantes
 * opcionais estão em uso — mais as conferências que dizem o que falta. As contas são do produto
 * (`lib/ia/resumo-da-ia.ts`); a faixa só lê e nunca grava.
 *
 * Não é `sticky`, de propósito: no casco real do app quem rola é a janela, e um `sticky` ali não
 * gruda (medido em produção em 26/10/2026 na tela de Nova campanha).
 */
import Link from "next/link";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import type { ConferenciaDaIA, Opcional, ResumoDaIA } from "@/lib/ia/resumo-da-ia";
import { contarAtencaoDaIA } from "@/lib/ia/resumo-da-ia";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  resumo: ResumoDaIA;
  /** O rótulo do provedor do Modelo padrão (ex.: "Anthropic (Claude)"). */
  rotuloDoProvedor: string;
  /** O nome do Modelo padrão como o catálogo o chama; `null` = nada definido. */
  nomeDoModelo: string | null;
}

export function ResumoDaIAFaixa({ resumo, rotuloDoProvedor, nomeDoModelo }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencaoDaIA(resumo.conferencias);
  const chave = resumo.origemDaChave;

  const celulaDaChave =
    chave.tipo === "empresa"
      ? {
          texto: t("Da empresa"),
          sub: chave.ultimos4 ? `${chave.rotulo} ••${chave.ultimos4}` : chave.rotulo,
          destaque: false,
        }
      : chave.tipo === "instalacao"
        ? { texto: t("Da instalação"), sub: t("Veio junto com a instalação do sistema"), destaque: false }
        : { texto: t("Falta"), sub: t("O agente não responde ninguém sem ela"), destaque: true };

  const celulas: { id: string; titulo: string; texto: string; sub: string | null; destaque: boolean }[] = [
    {
      id: "conversa",
      titulo: t("Quem conversa com o cliente"),
      texto: nomeDoModelo ?? t("não definido"),
      sub: rotuloDoProvedor,
      destaque: nomeDoModelo === null,
    },
    { id: "chave", titulo: t("Chave da IA"), ...celulaDaChave },
    {
      id: "padrao",
      titulo: t("O padrão vale em"),
      texto: `${resumo.herdam} ${t("de")} ${resumo.total} ${t("partes")}`,
      sub: t("Trocar o padrão muda todas de uma vez"),
      destaque: false,
    },
    {
      id: "opcionais",
      titulo: t("Ajudantes opcionais"),
      texto: `${resumo.opcionaisEmUso} ${t("de")} ${resumo.opcionais.length} ${t("em uso")}`,
      sub: resumo.opcionais.map((o) => rotuloDoOpcional(o, t)).join(" · "),
      destaque: false,
    },
  ];

  return (
    <section
      aria-label={t("Sua IA")}
      data-testid="resumo-da-ia"
      className="mb-6 rounded-xl border border-border bg-surface shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-ia-${c.id}`} className="bg-surface px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{c.titulo}</dt>
            <dd className={cn("truncate text-sm font-medium", c.destaque && "text-warning-fg")} title={c.texto}>
              {c.texto}
            </dd>
            {c.sub && <dd className="text-xs text-muted-foreground">{c.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="border-t border-border">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls="conferencias-da-ia"
          data-testid="ia-esta-certo-botao"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
        >
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
            {comAtencao === 0 ? (
              <span
                data-testid="ia-esta-certo-estado"
                data-estado="ok"
                className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                {t("Tudo certo")}
              </span>
            ) : (
              <span
                data-testid="ia-esta-certo-estado"
                data-estado="atencao"
                className="inline-flex items-center gap-1 text-sm font-medium text-warning-fg"
              >
                <Warning size={14} weight="bold" aria-hidden />
                {comAtencao === 1 ? t("1 pede atenção") : `${comAtencao} ${t("pedem atenção")}`}
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            {aberto ? t("esconder") : t("ver as conferências")}
            <CaretDown size={12} aria-hidden className={cn("transition-transform", aberto && "rotate-180")} />
          </span>
        </button>

        {aberto && (
          <ul id="conferencias-da-ia" className="space-y-2 border-t border-border px-4 py-3">
            {resumo.conferencias.map((c) => (
              <li
                key={c.id}
                data-testid={`conferencia-ia-${c.id}`}
                data-estado={c.estado}
                className="flex items-start gap-2 text-sm"
              >
                {c.estado === "ok" ? (
                  <CheckCircle size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-success" />
                ) : c.estado === "atencao" ? (
                  <Warning size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-warning" />
                ) : (
                  <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <p className="min-w-0">
                  {textoDaConferencia(c, t, rotuloDoProvedor)}
                  {c.motivo === "sem_chave" && (
                    <>
                      {" "}
                      <Link className="underline underline-offset-4" href="/app/ai/credentials">
                        {t("Cadastrar uma chave")}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function rotuloDoOpcional(o: Opcional, t: (s: string) => string): string {
  switch (`${o.id}:${o.estado}`) {
    case "jev:ligado":
      return t("Jev ligado");
    case "jev:desligado":
      return t("Jev desligado");
    case "audio:ligado":
      return t("Resposta em áudio ligada");
    case "audio:desligado":
      return t("Resposta em áudio desligada");
    case "mapas:ligado":
      return t("Mapas com chave");
    case "mapas:sem_chave":
      return t("Mapas sem chave");
    default:
      return `${o.id === "jev" ? "Jev" : o.id === "audio" ? t("Resposta em áudio") : t("Mapas")} —`;
  }
}

function textoDaConferencia(c: ConferenciaDaIA, t: (s: string) => string, provedor: string): string {
  switch (c.motivo) {
    case "chave_da_empresa":
      return `${t("A chave da empresa para")} ${provedor} ${t("está cadastrada.")}`;
    case "chave_da_instalacao":
      return t(
        "O agente usa a chave que veio junto com a instalação. Se quiser uma chave só da sua empresa, cadastre em Credenciais.",
      );
    case "sem_chave":
      return `${t("Não há chave para")} ${provedor}, ${t("nem da empresa nem da instalação: o agente não consegue responder ninguém.")}`;
    case "sem_avisos":
      return t("Nenhuma parte do sistema pede atenção.");
    case "partes_com_aviso":
      return c.quantidade === 1
        ? t("1 parte do sistema pede atenção: abra a configuração avançada do grupo que está marcado.")
        : `${c.quantidade ?? 0} ${t("partes do sistema pedem atenção: abra a configuração avançada dos grupos que estão marcados.")}`;
    case "jev_ligado":
      return t("O Jev está ligado: decide coisas pequenas e rápidas, junto com a IA principal.");
    case "jev_desligado":
      return t("O Jev está desligado. É opcional: serve para decisões rápidas, como perceber um cliente irritado.");
    case "audio_ligado":
      return t("A resposta em áudio está ligada.");
    case "audio_desligado":
      return t("A resposta em áudio está desligada. É opcional: o agente entende o áudio do cliente de qualquer jeito.");
    case "mapas_ligado":
      return t("A chave de Mapas está cadastrada: o pino de localização do WhatsApp vira rua e cidade.");
    case "mapas_sem_chave":
      return t("Sem chave de Mapas, o pino de localização não vira rua e cidade. É opcional.");
    case "jev_desconhecido":
    case "audio_desconhecido":
    case "mapas_desconhecido":
      return t("Não consegui ler o estado deste ajudante agora.");
    default:
      return c.motivo;
  }
}
