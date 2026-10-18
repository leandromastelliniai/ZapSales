"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import { ROTULO_DO_EFEITO } from "@/lib/ai/ferramentas-externas/tipos";

import { ChaveDaFerramentaDialog, FormularioDaFerramentaDialog, TesteDaFerramentaDialog } from "./_dialogs";

const CHAVE_DA_LISTA = ["ai", "external-tools"] as const;

function enderecoCurto(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function FerramentasExternasClient({ inicial }: { inicial: FerramentaExterna[] }) {
  const t = useT();
  const qc = useQueryClient();

  const lista = useQuery({
    queryKey: CHAVE_DA_LISTA,
    queryFn: async () => (await apiClient.get<{ data: FerramentaExterna[] }>("/api/v1/ai/external-tools")).data,
    initialData: inicial,
  });
  const ferramentas = lista.data ?? [];

  const [formulario, setFormulario] = useState<{ aberto: boolean; editando: FerramentaExterna | null }>({
    aberto: false,
    editando: null,
  });
  const [testando, setTestando] = useState<FerramentaExterna | null>(null);
  const [apagando, setApagando] = useState<FerramentaExterna | null>(null);
  /** A chave em claro, mostrada UMA vez (na criação e na troca). */
  const [chaveNova, setChaveNova] = useState<{ nome: string; chave: string } | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: CHAVE_DA_LISTA });

  async function alternarAtiva(f: FerramentaExterna, ativa: boolean) {
    try {
      await apiClient.patch(`/api/v1/ai/external-tools/${f.id}`, { ativa });
      toast.success(ativa ? t("Ferramenta ativada.") : t("Ferramenta desativada."));
      await recarregar();
    } catch (err) {
      showApiError(err);
    }
  }

  async function novaChave(f: FerramentaExterna) {
    try {
      const res = await apiClient.post<{ data: { signing_secret: string } }>(
        `/api/v1/ai/external-tools/${f.id}/rotate-secret`,
        {},
      );
      setChaveNova({ nome: f.name, chave: res.data.signing_secret });
      await recarregar();
    } catch (err) {
      showApiError(err);
    }
  }

  async function apagar(f: FerramentaExterna) {
    try {
      await apiClient.delete(`/api/v1/ai/external-tools/${f.id}`);
      toast.success(t("Ferramenta apagada."));
      setApagando(null);
      await recarregar();
    } catch (err) {
      setApagando(null);
      showApiError(err);
    }
  }

  return (
    <div className="space-y-5" data-testid="ferramentas-externas">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ferramentas.length === 0
            ? t("Nenhuma ferramenta cadastrada ainda.")
            : `${ferramentas.length} ${ferramentas.length === 1 ? t("ferramenta") : t("ferramentas")}`}
        </p>
        <Button data-testid="nova-ferramenta" onClick={() => setFormulario({ aberto: true, editando: null })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {t("Nova ferramenta")}
        </Button>
      </div>

      {ferramentas.length === 0 ? (
        <Card className="space-y-2 p-6" data-testid="ferramentas-vazio">
          <h2 className="text-base font-medium">{t("O agente ainda não consulta nenhum sistema")}</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Cadastre o endereço de um webhook (Make, n8n, planilha, ERP) e diga quando o agente deve usá-lo — por exemplo, para ver se um produto está em estoque. O agente só chama com os dados que você pedir, e o que o outro sistema responder chega a ele como informação, nunca como ordem.",
            )}{" "}
            {t(
              "Ações que alteram algo (criar um pedido, cadastrar um cliente) esperam a sua aprovação na Central de avisos, a menos que você desligue essa chave.",
            )}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ferramentas.map((f) => (
            <li key={f.id}>
              <Card className="space-y-3 p-4" data-testid={`ferramenta-${f.id}`} data-ativa={f.active ? "sim" : "nao"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-medium">{f.name}</h2>
                      <Badge variant="outline" className="text-[11px]">
                        {t(ROTULO_DO_EFEITO[f.effect])}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        data-testid={`aprovacao-${f.id}`}
                        data-pede={decidirSePedeAprovacao({ effect: f.effect, requireApproval: f.require_approval, modo: "ao_vivo" }).pede ? "sim" : "nao"}
                      >
                        {decidirSePedeAprovacao({ effect: f.effect, requireApproval: f.require_approval, modo: "ao_vivo" }).pede
                          ? t("Pede aprovação")
                          : t("Executa direto")}
                      </Badge>
                      {!f.active ? (
                        <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                          {t("Desativada")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="max-w-[65ch] text-sm text-muted-foreground">{f.when_to_use}</p>
                    <p className="text-xs text-muted-foreground">
                      {enderecoCurto(f.url)} · {f.parameters.length}{" "}
                      {f.parameters.length === 1 ? t("campo") : t("campos")} · {t("chave")} …{f.secret_last4}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={f.active}
                      onCheckedChange={(v) => void alternarAtiva(f, v)}
                      aria-label={f.active ? t("Desativar") : t("Ativar")}
                      data-testid={`ativar-${f.id}`}
                    />
                    {f.active ? t("Ativa") : t("Desativada")}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" data-testid={`testar-${f.id}`} onClick={() => setTestando(f)}>
                    {t("Testar de verdade")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`editar-${f.id}`}
                    onClick={() => setFormulario({ aberto: true, editando: f })}
                  >
                    {t("Editar")}
                  </Button>
                  <Button size="sm" variant="outline" data-testid={`nova-chave-${f.id}`} onClick={() => void novaChave(f)}>
                    {t("Gerar nova chave")}
                  </Button>
                  <Button size="sm" variant="ghost" data-testid={`apagar-${f.id}`} onClick={() => setApagando(f)}>
                    {t("Apagar")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <FormularioDaFerramentaDialog
        aberto={formulario.aberto}
        editando={formulario.editando}
        onFechar={() => setFormulario({ aberto: false, editando: null })}
        onSalvo={async (resultado) => {
          setFormulario({ aberto: false, editando: null });
          await recarregar();
          if (resultado.chave) setChaveNova({ nome: resultado.nome, chave: resultado.chave });
        }}
      />

      <ChaveDaFerramentaDialog dados={chaveNova} onFechar={() => setChaveNova(null)} />

      <TesteDaFerramentaDialog ferramenta={testando} onFechar={() => setTestando(null)} />

      <AlertDialog open={apagando !== null} onOpenChange={(aberto) => (aberto ? null : setApagando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Apagar esta ferramenta?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Ela deixa de existir. Se algum agente já a usou numa versão publicada, o sistema não deixa apagar — nesse caso, desative.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction data-testid="confirmar-apagar" onClick={() => apagando && void apagar(apagando)}>
              {t("Apagar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
