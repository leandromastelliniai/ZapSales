"use client";
/**
 * A recomendação da casa, com o MOTIVO. Violeta é a cor da IA no produto (DESIGN.md): aqui
 * ela marca "o que o sistema sugere", sempre acompanhada da razão em uma frase, porque
 * recomendação sem motivo é ordem, e quem configura o próprio negócio quer entender.
 */
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { Sparkle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function FaixaRecomendada({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const t = useT();
  return (
    <div
      role="note"
      data-testid={testId ?? "faixa-recomendada"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-ia/25 bg-ia-fundo px-3 py-2.5 text-sm",
        className,
      )}
    >
      <Sparkle size={18} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-ia" />
      <p className="min-w-0">
        <strong className="font-semibold text-ia">{t("Recomendado:")}</strong> {children}
      </p>
    </div>
  );
}

/** O chip curto "Recomendado" ao lado de um nome (um pacote, uma opção). */
export function SeloRecomendado() {
  const t = useT();
  return (
    <span
      data-testid="selo-recomendado"
      className="inline-flex items-center gap-1 rounded-full bg-ia-fundo px-2 py-0.5 text-[11px] font-medium text-ia"
    >
      <Sparkle size={11} weight="fill" aria-hidden />
      {t("Recomendado")}
    </span>
  );
}
