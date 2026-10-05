"use client";
/**
 * O ASSISTENTE DE CONEXÃO OFICIAL (issue #5).
 *
 * Três passos, na ordem em que a pessoa pensa:
 *   1. "Estas são as credenciais do meu app" — token do System User e chave
 *      secreta do app (o verify token é opcional: o servidor gera um forte).
 *      O botão TESTA e diz o que está errado, com o que fazer.
 *   2. "Qual número?" — a lista vem da Meta; ninguém digita id. O checklist da
 *      conta (app em Live, forma de pagamento, empresa verificada) fica ao lado.
 *   3. "Registrar e conectar" — PIN de duas etapas e o uso declarado.
 *
 * Os segredos vivem só na memória desta aba e saem dela assim que a conexão
 * grava: nenhum GET os devolve. O `<form method="post">` não é enfeite: se o
 * bundle não carregar, o submit nativo não põe credencial na URL.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useConnectOfficialChannel,
  useDiagnosticarCredencial,
  type DiagnosticoDaCredencial,
} from "@/hooks/channels/useOfficialChannel";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { UsoDoNumero } from "@/lib/channels/uso";

import { corDaQualidade, rotuloDaQualidade, rotuloDoLimite, USOS_NA_TELA } from "./rotulos-do-numero";

const ROTULO_DO_ITEM: Record<DiagnosticoDaCredencial["contas"][number]["checklist"][number]["item"], string> = {
  app_live: "App da Meta em Live",
  forma_de_pagamento: "Forma de pagamento",
  empresa_verificada: "Empresa verificada",
};

const MARCA_DO_ESTADO = { ok: "✓", pendente: "!", desconhecido: "?" } as const;

export function AssistenteConexaoOficial({ jaConectado }: { jaConectado: boolean }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const diagnosticar = useDiagnosticarCredencial();
  const conectar = useConnectOfficialChannel();

  const [credencial, setCredencial] = useState({ token: "", app_secret: "", verify_token: "" });
  const [diagnostico, setDiagnostico] = useState<DiagnosticoDaCredencial | null>(null);
  const [escolha, setEscolha] = useState<{ wabaId: string; numeroId: string } | null>(null);
  const [pin, setPin] = useState("");
  const [uso, setUso] = useState<UsoDoNumero | null>(null);
  const [erroDaConexao, setErroDaConexao] = useState<string | null>(null);

  async function testar(e: React.FormEvent) {
    e.preventDefault();
    setEscolha(null);
    setErroDaConexao(null);
    let r: Awaited<ReturnType<typeof diagnosticar.mutateAsync>>;
    try {
      r = await diagnosticar.mutateAsync({
        token: credencial.token.trim(),
        ...(credencial.app_secret.trim() ? { app_secret: credencial.app_secret.trim() } : {}),
      });
    } catch {
      // Recusa da própria rota (422, sem permissão): o `onError` do hook já mostrou.
      setDiagnostico(null);
      return;
    }
    setDiagnostico(r.data);
    // Um número só na conta inteira: já vem escolhido — escolher o óbvio é passo
    // que não ensina nada.
    const todos = r.data.contas.flatMap((c) => c.numeros.map((n) => ({ wabaId: c.wabaId, numeroId: n.id })));
    if (r.data.ok && todos.length === 1) setEscolha(todos[0]!);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!escolha || !uso) return;
    setErroDaConexao(null);
    try {
      const r = await conectar.mutateAsync({
        waba_id: escolha.wabaId,
        phone_number_id: escolha.numeroId,
        token: credencial.token.trim(),
        app_secret: credencial.app_secret.trim(),
        ...(credencial.verify_token.trim() ? { verify_token: credencial.verify_token.trim() } : {}),
        pin,
        uso,
      });
      toast.success(`${t("Conectado:")} ${r.data.displayName} ${r.data.phoneNumber ?? ""}`.trim());
      if (r.data.webhookDoApp && !r.data.webhookDoApp.assinado) {
        toast.warning(
          `${t("O número envia e recebe, mas a saúde e os modelos ainda não chegam:")} ${r.data.webhookDoApp.erro ?? ""}`,
        );
      }
      // Os segredos saem da memória da aba assim que gravam.
      setCredencial({ token: "", app_secret: "", verify_token: "" });
      setPin("");
      setDiagnostico(null);
      setEscolha(null);
    } catch (err) {
      setErroDaConexao(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-4" data-testid="assistente-oficial">
      <div>
        <h2 className="font-medium">
          {jaConectado ? t("Conectar outro número ou trocar a credencial") : t("Conectar número oficial")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("O assistente testa a credencial com a Meta, mostra os números da sua conta e faz o registro e o webhook sozinho. Nada é gravado até o último passo.")}
        </p>
      </div>

      {/* ─── Passo 1 — credenciais ─────────────────────────────────────── */}
      <form method="post" onSubmit={testar} className="flex flex-col gap-3" data-testid="assistente-passo-credenciais">
        <h3 className="text-sm font-semibold">1. {t("Credenciais do seu app na Meta")}</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assistente-token">{t("Token do usuário do sistema")}</Label>
          <Input
            id="assistente-token"
            type="password"
            autoComplete="off"
            value={credencial.token}
            onChange={(e) => setCredencial((c) => ({ ...c, token: e.target.value }))}
            placeholder="EAAG…"
            required
          />
          <span className="text-xs text-muted-foreground">
            {t("Configurações do negócio › Usuários do sistema › Gerar token, com as permissões whatsapp_business_management e whatsapp_business_messaging e sem data de validade.")}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assistente-app-secret">{t("Chave secreta do aplicativo")}</Label>
          <Input
            id="assistente-app-secret"
            type="password"
            autoComplete="off"
            value={credencial.app_secret}
            onChange={(e) => setCredencial((c) => ({ ...c, app_secret: e.target.value }))}
            placeholder={t("32 letras e números")}
            required
          />
          <span className="text-xs text-muted-foreground">
            {t("Configurações do app › Básico. É com ela que o sistema confere que cada mensagem recebida veio mesmo da Meta.")}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assistente-verify-token">
            {t("Token de verificação do webhook")}{" "}
            <span className="font-normal text-muted-foreground">({t("opcional")})</span>
          </Label>
          <Input
            id="assistente-verify-token"
            type="password"
            autoComplete="off"
            value={credencial.verify_token}
            onChange={(e) => setCredencial((c) => ({ ...c, verify_token: e.target.value }))}
          />
          <span className="text-xs text-muted-foreground">
            {t("Deixe em branco e o sistema gera um forte. Ele é enviado à Meta junto do endereço do webhook — você não precisa colar nada.")}
          </span>
        </div>
        <div>
          <Button
            type="submit"
            variant={diagnostico?.ok ? "outline" : "default"}
            disabled={diagnosticar.isPending || !credencial.token.trim() || !credencial.app_secret.trim()}
            data-testid="assistente-testar"
          >
            {diagnosticar.isPending ? t("Testando com a Meta…") : t("Testar credencial")}
          </Button>
        </div>

        {diagnostico && diagnostico.problemas.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
            data-testid="assistente-problemas"
          >
            {diagnostico.problemas.map((p) => (
              <div key={p.codigo} data-testid={`assistente-problema-${p.codigo}`}>
                <p className="text-sm">{p.mensagem}</p>
                {p.detalhe ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.detalhe}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        {diagnostico && diagnostico.avisos.length > 0 ? (
          <div className="rounded-md border border-warning/40 bg-warning-bg p-3" data-testid="assistente-avisos">
            {diagnostico.avisos.map((a) => (
              <p key={a.codigo} className="text-sm text-warning-fg">
                {a.mensagem}
              </p>
            ))}
          </div>
        ) : null}
      </form>

      {/* ─── Passo 2 — escolher o número ──────────────────────────────── */}
      {diagnostico?.ok ? (
        <section className="flex flex-col gap-3" data-testid="assistente-passo-numero">
          <h3 className="text-sm font-semibold">2. {t("Escolha o número")}</h3>
          {diagnostico.contas.map((conta) => (
            <div key={conta.wabaId} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{conta.nome ?? t("Conta do WhatsApp Business")}</span>
                <span className="font-mono text-xs text-muted-foreground">WABA {conta.wabaId}</span>
              </div>

              <ul className="flex flex-col gap-1" data-testid="assistente-checklist">
                {conta.checklist.map((item) => (
                  <li key={item.item} className="flex items-start gap-2 text-sm" data-testid={`checklist-${item.item}`} data-estado={item.estado}>
                    <span
                      aria-hidden
                      className={
                        item.estado === "ok"
                          ? "font-semibold text-success-fg"
                          : item.estado === "pendente"
                            ? "font-semibold text-warning-fg"
                            : "font-semibold text-muted-foreground"
                      }
                    >
                      {MARCA_DO_ESTADO[item.estado]}
                    </span>
                    <span>
                      <span className="font-medium">{t(ROTULO_DO_ITEM[item.item])}:</span> {item.mensagem}
                    </span>
                  </li>
                ))}
              </ul>

              {conta.erro ? <p className="text-xs text-destructive">{conta.erro}</p> : null}
              {conta.numeros.length === 0 && !conta.erro ? (
                <p className="text-sm text-muted-foreground">{t("Esta conta ainda não tem número.")}</p>
              ) : null}

              <div className="flex flex-col gap-2">
                {conta.numeros.map((n) => (
                  <label
                    key={n.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-foreground"
                  >
                    <input
                      type="radio"
                      name="assistente-numero"
                      value={n.id}
                      checked={escolha?.numeroId === n.id}
                      onChange={() => setEscolha({ wabaId: conta.wabaId, numeroId: n.id })}
                      data-testid={`assistente-numero-${n.id}`}
                    />
                    <span className="flex flex-1 flex-col">
                      <span className="font-medium">{n.numeroExibido ?? n.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.nomeVerificado ?? "—"} · {rotuloDoLimite(n.limite, t, idioma)}
                      </span>
                    </span>
                    <Badge variant="outline" className={corDaQualidade(n.qualidade)}>
                      {rotuloDaQualidade(n.qualidade, t)}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* ─── Passo 3 — registrar e conectar ───────────────────────────── */}
      {diagnostico?.ok && escolha ? (
        <form method="post" onSubmit={enviar} className="flex flex-col gap-3" data-testid="assistente-passo-conectar">
          <h3 className="text-sm font-semibold">3. {t("Registrar e conectar")}</h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistente-pin">{t("PIN de confirmação em duas etapas")}</Label>
            <Input
              id="assistente-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="\d{6}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-40 font-mono tracking-widest"
              required
            />
            <span className="text-xs text-muted-foreground">
              {t("Seis dígitos. Se o número já tem PIN, use o mesmo; se não tem, o que você digitar aqui vira o PIN dele.")}
            </span>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("Para que serve este número?")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {USOS_NA_TELA.map((u) => (
                <label
                  key={u.valor}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-foreground"
                >
                  <input
                    type="radio"
                    name="assistente-uso"
                    value={u.valor}
                    checked={uso === u.valor}
                    onChange={() => setUso(u.valor)}
                    data-testid={`assistente-uso-${u.valor}`}
                    className="mt-0.5"
                    required
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{t(u.rotulo)}</span>
                    <span className="text-xs text-muted-foreground">{t(u.descricao)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {erroDaConexao ? (
            <p role="alert" className="text-sm text-destructive" data-testid="assistente-erro-conexao">
              {erroDaConexao}
            </p>
          ) : null}

          <div>
            <Button
              type="submit"
              disabled={conectar.isPending || pin.length !== 6 || !uso}
              data-testid="assistente-conectar"
            >
              {conectar.isPending ? t("Registrando na Meta…") : t("Registrar e conectar")}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
