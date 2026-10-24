"use client";
/**
 * A prévia do assistente: como a conversa COMEÇA com o agente que está sendo montado.
 *
 * É FIXA de propósito. Ela mostra a frase de abertura que a composição produz agora, e
 * nunca chama a inteligência artificial: não gasta a chave de ninguém e funciona numa
 * instalação que ainda nem tem chave. A resposta real do agente se vê no teste, depois
 * de criado — e a prévia diz isso.
 *
 * O brilho (`aura-ia`) é estático: a IA aparece com a cor da IA, sem agitação.
 */
import { useT } from "@/hooks/i18n/useT";
import { Selo } from "@/components/ui/selo";
import type { AgenteComposto } from "@/lib/ai/agents/assistente/compor";

export function PreviaFixa({ agente, nome }: { agente: AgenteComposto; nome: string }) {
  const t = useT();
  return (
    <aside
      aria-label={t("Prévia do agente")}
      className="aura-ia space-y-3 rounded-xl border bg-surface p-4"
      data-testid="previa-do-agente"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t("Como a conversa começa")}</h2>
        <Selo significado="ia">{nome.trim() || agente.name}</Selo>
      </div>
      <div
        className="rounded-lg rounded-tl-sm bg-ia-fundo px-3 py-2 text-sm"
        data-testid="previa-abertura"
      >
        {agente.profile_welcome.trim() || t("O agente espera o cliente falar primeiro.")}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "É só a frase de abertura. A resposta de verdade você vê no teste, logo depois de criar o agente.",
        )}
      </p>
    </aside>
  );
}
