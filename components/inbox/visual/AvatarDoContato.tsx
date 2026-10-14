"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Clock, Robot, UserCircle, Users } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Quem está com a conversa, num selo na foto. Cada valor tem UMA cor em todo o
 * produto (direção "Linha do Funil", `docs/design-system/02-palette-futuristas.md`):
 * violeta é o automático/IA, ciano é a pessoa, âmbar é a fila.
 */
export type SeloDeQuemAtende = "ia" | "humano" | "fila" | "neutro";

const TAMANHO = {
  lista: { caixa: "h-12 w-12 text-sm", canal: 14, selo: "h-5 w-5", icone: 11 },
  conversa: { caixa: "h-10 w-10 text-xs", canal: 12, selo: "h-4 w-4", icone: 9 },
  faixa: { caixa: "h-16 w-16 text-lg", canal: 16, selo: "h-5 w-5", icone: 11 },
  mini: { caixa: "h-5 w-5 text-[9px]", canal: 0, selo: "", icone: 0 },
} as const;

const COR_DO_SELO: Record<SeloDeQuemAtende, string> = {
  ia: "bg-ia text-bg",
  humano: "bg-humano text-bg",
  fila: "bg-funil text-bg",
  neutro: "bg-text-subtle text-bg",
};

const ICONE_DO_SELO = { ia: Robot, humano: UserCircle, fila: Clock, neutro: null } as const;

/** "Mariana Costa" → "MC"; nome de uma palavra → as duas primeiras letras. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return [...(partes[0] ?? "")].slice(0, 2).join("").toUpperCase();
  const primeira = [...(partes[0] ?? "")][0] ?? "";
  const ultima = [...(partes[partes.length - 1] ?? "")][0] ?? "";
  return (primeira + ultima).toUpperCase();
}

type Canal = Parameters<typeof ChannelLogo>[0]["channel"];

interface Props {
  nome: string;
  /** URL da foto, ou `null` para as iniciais. Foto que não carrega cai nas iniciais. */
  fotoUrl?: string | null;
  tamanho?: keyof typeof TAMANHO;
  /** Por onde a conversa chegou; `undefined` esconde o selo do canal. */
  canal?: Canal;
  /** Quem atende agora; `null` esconde o selo. */
  selo?: SeloDeQuemAtende | null;
  /** Rótulo do selo para leitor de tela e para o passar do mouse. */
  rotuloDoSelo?: string;
  naoLidas?: number;
  /** Anel em volta da foto: a cor de quem fala (ciano = atendente, violeta = IA). */
  anel?: "humano" | "ia" | null;
  grupo?: boolean;
  className?: string;
}

export function AvatarDoContato({
  nome,
  fotoUrl,
  tamanho = "lista",
  canal,
  selo,
  rotuloDoSelo,
  naoLidas = 0,
  anel,
  grupo = false,
  className,
}: Props) {
  const medida = TAMANHO[tamanho];
  const IconeDoSelo = selo ? ICONE_DO_SELO[selo] : null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar
        className={cn(
          medida.caixa,
          anel === "humano" && "ring-2 ring-humano ring-offset-2 ring-offset-bg",
          anel === "ia" && "ring-2 ring-ia ring-offset-2 ring-offset-bg",
        )}
      >
        {fotoUrl ? <AvatarImage src={fotoUrl} alt="" className="object-cover" /> : null}
        <AvatarFallback className="bg-surface-elevated font-medium text-text-muted">
          {grupo ? (
            <Users size={medida.icone * 2 || 12} weight="duotone" aria-hidden />
          ) : (
            iniciaisDe(nome)
          )}
        </AvatarFallback>
      </Avatar>
      {canal !== undefined && medida.canal > 0 ? (
        <ChannelLogo
          channel={canal}
          size={medida.canal}
          className="absolute -right-0.5 -bottom-0.5 rounded-full bg-bg ring-2 ring-bg"
        />
      ) : null}
      {selo ? (
        <span
          role="img"
          aria-label={rotuloDoSelo}
          title={rotuloDoSelo}
          className={cn(
            "absolute -bottom-0.5 -left-0.5 inline-flex items-center justify-center rounded-full ring-2 ring-bg",
            selo === "neutro" ? "h-3 w-3" : medida.selo,
            COR_DO_SELO[selo],
          )}
        >
          {IconeDoSelo ? <IconeDoSelo size={medida.icone} weight="fill" aria-hidden /> : null}
        </span>
      ) : null}
      {naoLidas > 0 ? (
        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-funil px-1 text-[10px] font-semibold text-acao-fg tabular-nums ring-2 ring-bg">
          {naoLidas}
        </span>
      ) : null}
    </span>
  );
}
