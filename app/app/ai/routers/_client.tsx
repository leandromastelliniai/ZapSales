"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter as useNextRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Painel } from "@/components/ui/painel";
import { Selo } from "@/components/ui/selo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Signpost, Plus } from "@/lib/ui/icons";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useRouters, useCreateRouter, type RouterListItem } from "@/hooks/ai/useRouters";
import type { ChannelSessionLite } from "../agents/[id]/_components/AgentForm";
import { rotuloDoEstadoDoCanal } from "@/lib/channels/estado";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  initialState: { routers: RouterListItem[] };
  channelSessions: ChannelSessionLite[];
}

function channelLabel(
  sessions: ChannelSessionLite[],
  id: string,
  t: (texto: string) => string = (texto) => texto,
): string {
  const s = sessions.find((c) => c.id === id);
  if (!s) return t("Número removido");
  return s.phone_number ? `${s.display_name} · ${s.phone_number}` : s.display_name;
}

export function RoutersClient({ initialState, channelSessions }: Props) {
  const t = useT();
  const { data } = useRouters(initialState);
  const routers = data?.routers ?? [];
  const canManagePerm = usePermission("ai.routers.manage");
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex sm:justify-end">
        {canManagePerm && (
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus /> {t("Novo roteador")}
          </Button>
        )}
      </div>

      {routers.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Signpost size={32} className="text-muted-foreground" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            {t(
              "Um roteador entende o que o cliente quer e entrega a conversa para o agente certo — um número de vendas fala com quem quer comprar, um de suporte com quem já é cliente, tudo no mesmo WhatsApp. Crie um para o seu número e escolha quais agentes ele aciona.",
            )}
          </p>
          {canManagePerm && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t("Criar meu primeiro roteador")}
            </Button>
          )}
        </Card>
      ) : (
        <Painel semRecuo>
          <ul className="divide-y divide-border">
            {routers.map((r) => (
              <li
                key={r.id}
                className="group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-5 py-4 transition-colors hover:bg-surface-elevated/60"
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text-muted"
                >
                  <Signpost size={24} />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/app/ai/routers/${r.id}`}
                      title={r.name}
                      className="min-w-0 truncate font-semibold tracking-tight outline-hidden after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {r.name}
                    </Link>
                    <Selo significado={r.is_active ? "concluido" : "neutro"}>
                      {r.is_active ? t("ativo") : t("inativo")}
                    </Selo>
                  </div>
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    <span className="truncate">{channelLabel(channelSessions, r.channel_session_id, t)}</span>
                    <span>
                      {r.member_count === 0
                        ? t("Sem intenções configuradas")
                        : `${r.member_count} ${r.member_count === 1 ? t("intenção") : t("intenções")}`}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <CreateRouterDialog
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onOpenChange={setCreateOpen}
        channelSessions={channelSessions}
      />
    </div>
  );
}

function CreateRouterDialog({
  open,
  onOpenChange,
  channelSessions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelSessions: ChannelSessionLite[];
}) {
  const t = useT();
  const nextRouter = useNextRouter();
  const create = useCreateRouter();
  const [name, setName] = React.useState("");
  const [channelSessionId, setChannelSessionId] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { name, channel_session_id: channelSessionId },
      {
        onSuccess: (res) => {
          toast.success(t("Roteador criado — agora escolha as intenções."));
          onOpenChange(false);
          nextRouter.push(`/app/ai/routers/${res.id}`);
        },
        onError: showApiError,
      },
    );
  }

  const valid = name.trim().length > 0 && channelSessionId.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Novo roteador")}</DialogTitle>
          <DialogDescription>
            {t(
              "Escolha o número de WhatsApp que ele vai atender. Depois de criado, você define as intenções e para qual agente cada uma vai.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="router-name">{t("Nome")}</Label>
            <Input
              id="router-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Ex.: Roteador de vendas")}
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="router-channel">{t("Número de WhatsApp")}</Label>
            <Select value={channelSessionId || undefined} onValueChange={setChannelSessionId}>
              <SelectTrigger id="router-channel">
                <SelectValue placeholder={t("Selecione um número")} />
              </SelectTrigger>
              <SelectContent>
                {channelSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {/* Mesmo JSX do editor de agente, e o mesmo defeito: o
                        estado saía cru. Consertar só um lado deixaria o outro. */}
                    {s.display_name}
                    {s.phone_number ? ` · ${s.phone_number}` : ""} ·{" "}
                    {rotuloDoEstadoDoCanal(s.status, t)}
                  </SelectItem>
                ))}
                {channelSessions.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    {t("Nenhum número conectado")}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("Só é possível ter um roteador ativo por número.")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? t("Criando…") : t("Criar roteador")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
