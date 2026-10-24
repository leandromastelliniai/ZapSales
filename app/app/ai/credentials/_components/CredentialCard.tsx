"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { refreshCredentialsView } from "../_actions";

import { Button } from "@/components/ui/button";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowsClockwise, PencilSimple, Trash } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  credentialStatus,
  credentialsListQueryKey,
  type CredentialRow,
  type CredentialStatus,
} from "@/hooks/ai/useCredentials";
import { useT } from "@/hooks/i18n/useT";
import { ehProvedorDeDecisao, PROVEDORES_COM_CHAVE } from "@/lib/ai/pontos/provedores";
import { descreverErroDeValidacao } from "@/lib/ai/credenciais/erro-de-validacao";
import { RotateCredentialDialog } from "./RotateCredentialDialog";

interface Props {
  credential: CredentialRow;
  canWrite: boolean;
  usageCount: number;
  /**
   * As tarefas em que a chave trabalha fora dos agentes (hoje, as do Jev). Não
   * trava a exclusão como `usageCount`: excluir desliga o Jev, e o diálogo avisa.
   */
  usadaEm?: readonly string[];
  /** As frases do diálogo de exclusão para a chave do Jev em uso (`avisoAoExcluirAChaveDoJev`). */
  avisoAoExcluir?: readonly string[];
}

const STATUS_LABEL: Record<CredentialStatus, string> = {
  validated: "Validada",
  validating: "Validando…",
  unvalidated: "Não validada",
  invalid: "Inválida",
  inactive: "Inativa",
};

// A cor segue o significado do `Selo`: verde = deu certo, coral = recusada, âmbar = esperando
// (a validação não terminou). Antes a chave validada saía em violeta, que no produto é a cor da IA.
const STATUS_SELO: Record<CredentialStatus, SignificadoDoSelo> = {
  validated: "concluido",
  validating: "neutro",
  unvalidated: "funil",
  invalid: "falha",
  inactive: "neutro",
};

export function CredentialCard({ credential, canWrite, usageCount, usadaEm = [], avisoAoExcluir }: Props) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const status = credentialStatus(credential);
  const last4 = credential.api_key_last4 ?? "????";
  const inUse = usageCount > 0;
  const erro = descreverErroDeValidacao(credential.validation_error, credential.provider);
  const provedor = PROVEDORES_COM_CHAVE.find((p) => p.id === credential.provider);

  const onRevalidate = () => {
    startTransition(async () => {
      try {
        await apiClient.post(`/api/v1/ai/credentials/${credential.id}/revalidate`, {});
        toast.success(t("Revalidando…"));
        await qc.invalidateQueries({ queryKey: credentialsListQueryKey });
      } catch (err) {
        showApiError(err);
      }
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      try {
        const res = await apiClient.delete<{ data?: { jev_desligado?: boolean } }>(
          `/api/v1/ai/credentials/${credential.id}`,
        );
        toast.success(
          res?.data?.jev_desligado
            ? t("Credencial removida. O Jev foi desligado.")
            : t("Credencial removida."),
        );
        setDeleteOpen(false);
        await qc.invalidateQueries({ queryKey: credentialsListQueryKey });
        await refreshCredentialsView();
        router.refresh();
      } catch (err) {
        showApiError(err);
      }
    });
  };

  const deleteButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("Excluir credencial")}
      disabled={!canWrite || inUse || isPending}
      onClick={() => setDeleteOpen(true)}
    >
      <Trash size={14} aria-hidden />
    </Button>
  );

  return (
    <div className="grid grid-cols-1 items-center gap-x-6 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate font-semibold tracking-tight" title={credential.label}>
            {credential.label}
          </h3>
          <Selo significado={STATUS_SELO[status]}>{t(STATUS_LABEL[status])}</Selo>
        </div>
        <p className="font-mono text-xs text-muted-foreground">…{last4}</p>

        {credential.validation_error && (
          <p className="text-sm text-error-fg" title={credential.validation_error}>
            {erro.generico
              ? `${t("Falha na validação")} (${credential.validation_error}).`
              : t(erro.frase)}
            {erro.chaveErrada && provedor && (
              <>
                {" "}
                <a
                  className="underline underline-offset-4"
                  href={provedor.ondePegarAChave}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Onde pegar a chave")}
                </a>
              </>
            )}
          </p>
        )}

        {status === "unvalidated" && (
          <p className="text-sm text-muted-foreground">
            {t("A validação não terminou. Clique em revalidar para testar a chave agora.")}
          </p>
        )}

        {usadaEm.length > 0 && (
          <p className="text-sm" data-testid="credencial-usada-em">
            <span className="text-muted-foreground">{t("Usada em")}:</span>{" "}
            {usadaEm.map((tarefa) => t(tarefa)).join(", ")}
          </p>
        )}
      </div>

      {/* "Em uso por" conta versões de agente, e nenhuma aponta para a chave do
          Jev: o "0" dela, colado no "Usada em" logo acima, dizia que dava para
          excluí-la sem efeito. */}
      {!ehProvedorDeDecisao(credential.provider) && (
        <dl className="flex gap-8 text-sm whitespace-nowrap">
          <div>
            <dt className="text-xs text-muted-foreground">{t("Modelos")}</dt>
            <dd className="font-mono">{credential.models_available?.length ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("Em uso por")}</dt>
            <dd className="font-mono">{usageCount}</dd>
          </div>
        </dl>
      )}

      {canWrite && (
        <div className="-ml-2 flex items-center gap-1 md:ml-0 md:justify-end">
          {/* Rotacionar é o caminho que NÃO passa pela exclusão — e por isso
              fica habilitado mesmo com a chave em uso. É por aqui que o
              operador de um agente publicado troca a chave. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Editar credencial")}
            disabled={isPending}
            onClick={() => setEditOpen(true)}
          >
            <PencilSimple size={14} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Revalidar credencial")}
            disabled={isPending}
            onClick={onRevalidate}
          >
            <ArrowsClockwise size={14} aria-hidden />
          </Button>
          {inUse ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{deleteButton}</span>
                </TooltipTrigger>
                {/* Sem largura máxima o Radix desenha `minWidth: max-content`: esta
                    frase, de 267 caracteres, vira UMA linha de ~1467px e o fim dela sai
                    da tela em 1280, 1366 e 1440. Mesmo padrão de PlatformAdminsTable. */}
                <TooltipContent className="max-w-xs break-words">
                  {t("Em uso por")} {usageCount} {t("versão(ões) de agente")}. {t("Para trocar a chave, use editar. Para excluir, nenhuma versão pode estar usando a chave — e versão já publicada ou substituída não aceita mais apontar para outra chave, então a exclusão fica travada enquanto esse histórico existir.")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            deleteButton
          )}
        </div>
      )}

      <RotateCredentialDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        credential={credential}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Remover credencial")} &ldquo;{credential.label}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {/* O diálogo só abre com `usageCount === 0` (a chave em uso tem o
                  botão desabilitado), então não há agente a avisar — a frase
                  antiga ("agents vão falhar") descrevia um caso que não chega
                  aqui. O que sobra é o irreversível — e, na chave do Jev, que
                  não trava, o efeito de excluí-la (a rota o desliga). */}
              {avisoAoExcluir && <>{avisoAoExcluir.map((frase) => t(frase)).join(" ")} </>}
              {t("Esta ação não pode ser desfeita.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={isPending}>
              {t("Remover")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
