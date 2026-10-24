"use client";

/**
 * O cartão "Resposta em áudio" em Provedores (issue #91).
 *
 * O agente já entende o áudio do cliente; aqui a organização decide se ele também
 * RESPONDE em nota de voz. É opcional, nasce DESLIGADO, e usa a chave de voz da
 * própria empresa (provedor compatível com a API de fala da OpenAI, ou
 * ElevenLabs). Por isso o cartão faz o caminho inteiro de quem nunca viu isto:
 * escolher o provedor, colar a chave, TESTAR de verdade, aceitar que o texto das
 * respostas vai para um fornecedor de voz e só então ligar.
 *
 * Uma instalação sem nenhuma chave de voz funciona normalmente — o cartão abre
 * dizendo, em uma frase, por que o recurso está indisponível e o que falta.
 *
 * A chave nunca volta ao browser: a tela vê os 4 últimos caracteres. Os dados vêm
 * de `GET /api/v1/ai/audio`; o estado mostrado é derivado deles e nunca guardado
 * aqui, para a tela não discordar da rota que o motor obedece.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { FRASE_DA_FALHA_DE_VOZ } from "@/lib/ai/resposta-em-audio/frases";
import type { ProvedorDeVozId } from "@/lib/ai/resposta-em-audio/tipos";

interface ChaveDoProvedor {
  configurada: boolean;
  ultimos4: string | null;
}

interface Estado {
  config: {
    ligado: boolean;
    provedor: ProvedorDeVozId;
    endereco: string | null;
    modelo: string | null;
    voz: string | null;
    limite_de_caracteres: number;
    custo_por_mil_caracteres_cents: number | null;
    aceite: { em: string; por: string } | null;
  };
  chaves: Record<ProvedorDeVozId, ChaveDoProvedor>;
  disponivel: boolean;
  por_que_indisponivel: "desligado" | "sem_aceite" | "sem_chave" | null;
  uso: {
    respostas_em_audio: number;
    falhas: number;
    caracteres: number;
    custo_cents: number;
    sem_preco: number;
    ultima_falha: { motivo: string; em: string; mensagem: string } | null;
  } | null;
  padroes: {
    endereco: string;
    modelo_openai: string;
    voz_openai: string;
    modelo_elevenlabs: string;
    limite_de_caracteres: number;
    limite_minimo: number;
    limite_maximo: number;
  };
}

type Teste =
  | { ok: true; somente_a_chave: boolean; vozes?: number; latencia_ms: number }
  | { ok: false; motivo: string; mensagem: string };

async function lerCorpo(res: Response): Promise<{ data?: unknown; error?: { message?: string } }> {
  try {
    return (await res.json()) as { data?: unknown; error?: { message?: string } };
  } catch {
    return {};
  }
}

export function CartaoDeRespostaEmAudio() {
  const t = useT();
  const tag = useTagDeIdioma();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState(false);
  const [ocupado, setOcupado] = useState<null | "salvar" | "testar" | "remover">(null);
  const [teste, setTeste] = useState<Teste | null>(null);

  // O formulário é local; o estado do servidor só o reinicia quando chega.
  const [ligado, setLigado] = useState(false);
  const [provedor, setProvedor] = useState<ProvedorDeVozId>("openai_compativel");
  const [endereco, setEndereco] = useState("");
  const [modelo, setModelo] = useState("");
  const [voz, setVoz] = useState("");
  const [limite, setLimite] = useState("1000");
  const [preco, setPreco] = useState("");
  const [chave, setChave] = useState("");
  const [aceito, setAceito] = useState(false);

  const aplicar = useCallback((e: Estado) => {
    setEstado(e);
    setLigado(e.config.ligado);
    setProvedor(e.config.provedor);
    setEndereco(e.config.endereco ?? "");
    setModelo(e.config.modelo ?? "");
    setVoz(e.config.voz ?? "");
    setLimite(String(e.config.limite_de_caracteres));
    setPreco(e.config.custo_por_mil_caracteres_cents === null ? "" : String(e.config.custo_por_mil_caracteres_cents));
    setAceito(e.config.aceite !== null);
  }, []);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/v1/ai/audio").catch(() => null);
    if (!res || !res.ok) {
      setErroDeCarga(true);
      return;
    }
    const corpo = await lerCorpo(res);
    const dados = corpo.data as Partial<Estado> | undefined;
    // Resposta que não é o estado (proxy, página de erro) é leitura falha, não cartão vazio.
    if (!dados?.config || !dados.chaves) {
      setErroDeCarga(true);
      return;
    }
    aplicar(dados as Estado);
    setErroDeCarga(false);
  }, [aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const chaveDoProvedor = estado?.chaves[provedor] ?? { configurada: false, ultimos4: null };
  const temChave = chaveDoProvedor.configurada || chave.trim() !== "";
  const compat = provedor === "openai_compativel";

  async function salvar() {
    if (!estado) return;
    setOcupado("salvar");
    setTeste(null);
    try {
      const limiteNumero = Number(limite);
      const precoNumero = preco.trim() === "" ? null : Number(preco.replace(",", "."));
      const corpoDoPut: Record<string, unknown> = {
        ligado,
        provedor,
        modelo: modelo.trim() === "" ? null : modelo.trim(),
        voz: compat && voz.trim() !== "" ? voz.trim() : null,
        limite_de_caracteres: limiteNumero,
        custo_por_mil_caracteres_cents: precoNumero,
        ...(compat ? { endereco: endereco.trim() === "" ? null : endereco.trim() } : {}),
        ...(aceito && estado.config.aceite === null ? { aceitar: true } : {}),
        ...(chave.trim() !== "" ? { api_key: chave.trim() } : {}),
      };
      const res = await fetch("/api/v1/ai/audio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoDoPut),
      });
      const corpo = await lerCorpo(res);
      if (!res.ok) {
        toast.error(corpo.error?.message ?? t("Não consegui gravar a configuração da resposta em áudio."));
        return;
      }
      aplicar(corpo.data as Estado);
      setChave("");
      toast.success(t("Resposta em áudio gravada."));
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("testar");
    setTeste(null);
    try {
      const res = await fetch("/api/v1/ai/audio/testar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provedor,
          modelo: modelo.trim() === "" ? null : modelo.trim(),
          voz: compat && voz.trim() !== "" ? voz.trim() : null,
          ...(compat ? { endereco: endereco.trim() === "" ? null : endereco.trim() } : {}),
          ...(chave.trim() !== "" ? { api_key: chave.trim() } : {}),
        }),
      });
      const corpo = await lerCorpo(res);
      if (!res.ok) {
        toast.error(corpo.error?.message ?? t("Não consegui testar agora."));
        return;
      }
      setTeste(corpo.data as Teste);
    } catch {
      setTeste({ ok: false, motivo: "indisponivel", mensagem: t(FRASE_DA_FALHA_DE_VOZ.indisponivel) });
    } finally {
      setOcupado(null);
    }
  }

  async function removerChave() {
    setOcupado("remover");
    setTeste(null);
    try {
      const res = await fetch(`/api/v1/ai/audio?provedor=${provedor}`, { method: "DELETE" });
      const corpo = await lerCorpo(res);
      if (!res.ok) {
        toast.error(corpo.error?.message ?? t("Não consegui remover a chave."));
        return;
      }
      aplicar(corpo.data as Estado);
      toast.success(t("Chave de voz removida."));
    } finally {
      setOcupado(null);
    }
  }

  const porQue: Record<"desligado" | "sem_aceite" | "sem_chave", string> = {
    desligado: t("Desligada. Os agentes respondem sempre em texto."),
    sem_aceite: t("Falta o seu aceite para enviar o texto das respostas ao provedor de voz."),
    sem_chave: t("Ligada, mas falta gravar a chave do provedor de voz. Enquanto isso, os agentes respondem em texto."),
  };

  const dinheiro = (cents: number) =>
    `US$ ${(cents / 100).toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  return (
    <Card className="mt-8 p-4" data-testid="cartao-de-resposta-em-audio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("Resposta em áudio")}</h2>
        {estado &&
          (estado.disponivel ? (
            <Badge variant="secondary" data-testid="audio-estado">
              {t("Disponível")}
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="audio-estado">
              {t("Indisponível")}
            </Badge>
          ))}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t(
          "Quando o cliente manda um áudio, o agente pode responder em nota de voz. É opcional, vem desligado e usa a chave de voz da sua própria empresa. O texto da resposta fica sempre gravado na conversa, e se a voz falhar a resposta sai em texto.",
        )}
      </p>

      {erroDeCarga && (
        <p className="mt-3 text-sm text-destructive">{t("Não consegui ler a configuração da resposta em áudio.")}</p>
      )}

      {estado && !estado.disponivel && estado.por_que_indisponivel && (
        <p className="mt-3 rounded-md border border-dashed p-3 text-sm" data-testid="audio-por-que">
          {porQue[estado.por_que_indisponivel]}
        </p>
      )}

      {estado && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="audio-provedor">{t("Provedor de voz")}</Label>
              <Select value={provedor} onValueChange={(v) => setProvedor(v as ProvedorDeVozId)}>
                <SelectTrigger id="audio-provedor" data-testid="audio-provedor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compativel">{t("Compatível com a API de fala da OpenAI")}</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="audio-chave">
                {chaveDoProvedor.configurada ? t("Trocar a chave de voz") : t("Chave de voz")}
                {chaveDoProvedor.configurada ? (
                  <Badge variant="secondary" className="ml-2" data-testid="audio-chave-gravada">
                    {t("Chave gravada")} ···{chaveDoProvedor.ultimos4}
                  </Badge>
                ) : null}
              </Label>
              <Input
                id="audio-chave"
                type="password"
                autoComplete="new-password"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder={compat ? "sk-…" : "sk_…"}
                data-testid="audio-chave"
              />
            </div>

            {compat && (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="audio-endereco">{t("Endereço da API (opcional)")}</Label>
                <Input
                  id="audio-endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder={estado.padroes.endereco}
                  data-testid="audio-endereco"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Deixe em branco para usar a OpenAI. Serviços de voz próprios só funcionam em endereço público — a rede interna da máquina é recusada por segurança.",
                  )}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="audio-modelo">{t("Modelo de voz (opcional)")}</Label>
              <Input
                id="audio-modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder={compat ? estado.padroes.modelo_openai : estado.padroes.modelo_elevenlabs}
                data-testid="audio-modelo"
              />
            </div>

            {compat ? (
              <div className="space-y-1">
                <Label htmlFor="audio-voz">{t("Voz (opcional)")}</Label>
                <Input
                  id="audio-voz"
                  value={voz}
                  onChange={(e) => setVoz(e.target.value)}
                  placeholder={estado.padroes.voz_openai}
                  data-testid="audio-voz"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground sm:self-end">
                {t("Com a ElevenLabs, cada agente escolhe a sua voz na lista da sua conta, no editor do agente.")}
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="audio-limite">{t("Limite de caracteres por resposta em áudio")}</Label>
              <Input
                id="audio-limite"
                type="number"
                min={estado.padroes.limite_minimo}
                max={estado.padroes.limite_maximo}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                data-testid="audio-limite"
              />
              <p className="text-xs text-muted-foreground">
                {t("Respostas maiores saem como texto — nunca são cortadas.")}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="audio-preco">{t("Preço por mil caracteres, em centavos de dólar (opcional)")}</Label>
              <Input
                id="audio-preco"
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                data-testid="audio-preco"
              />
              <p className="text-xs text-muted-foreground">
                {t("Para o custo aparecer no Uso de IA quando o produto não conhece o preço do seu provedor.")}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2">
              <input
                id="audio-aceite"
                type="checkbox"
                className="mt-1"
                checked={aceito}
                disabled={estado.config.aceite !== null}
                onChange={(e) => setAceito(e.target.checked)}
                data-testid="audio-aceite"
              />
              <Label htmlFor="audio-aceite" className="font-normal">
                {t(
                  "Entendo que o texto das respostas do agente será enviado ao provedor de voz que escolhi, com a minha chave.",
                )}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="audio-ligado"
                checked={ligado}
                onCheckedChange={setLigado}
                disabled={!temChave || !aceito}
                data-testid="audio-ligado"
              />
              <Label htmlFor="audio-ligado">{t("Ligar a resposta em áudio nesta organização")}</Label>
            </div>
            {(!temChave || !aceito) && (
              <p className="text-xs text-muted-foreground" data-testid="audio-ligar-bloqueado">
                {t("Para ligar: grave a chave do provedor de voz e marque o aceite acima.")}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={ocupado !== null} data-testid="audio-salvar">
              {ocupado === "salvar" ? t("Salvando…") : t("Salvar")}
            </Button>
            <Button variant="outline" onClick={testar} disabled={!temChave || ocupado !== null} data-testid="audio-testar">
              {ocupado === "testar" ? t("Testando…") : t("Testar")}
            </Button>
            {chaveDoProvedor.configurada && (
              <Button variant="ghost" onClick={removerChave} disabled={ocupado !== null} data-testid="audio-remover">
                {t("Remover chave")}
              </Button>
            )}
          </div>

          {teste && (
            <div
              className={`mt-3 rounded-md border p-3 text-sm ${teste.ok ? "border-success/40 bg-success-bg" : "border-destructive/40 bg-destructive/5"}`}
              data-testid="audio-resultado"
            >
              {teste.ok ? (
                <p>
                  {teste.somente_a_chave
                    ? `${t("A chave funciona. A sua conta tem")} ${teste.vozes ?? 0} ${t("vozes; cada agente escolhe a sua no editor.")}`
                    : t("Funcionou. O provedor gerou uma nota de voz de teste, sem enviar nada a ninguém.")}
                </p>
              ) : (
                <p>{teste.mensagem}</p>
              )}
            </div>
          )}

          {estado.uso && (
            <div className="mt-4 border-t pt-3 text-sm" data-testid="audio-uso">
              <p className="font-medium">{t("Neste mês")}</p>
              <p className="text-muted-foreground">
                {`${estado.uso.respostas_em_audio} ${t("respostas em áudio")} · ${estado.uso.caracteres.toLocaleString(tag)} ${t("caracteres convertidos")} · ${dinheiro(estado.uso.custo_cents)}`}
                {estado.uso.sem_preco > 0
                  ? ` · ${estado.uso.sem_preco} ${t("sem preço conhecido (informe o preço acima)")}`
                  : ""}
              </p>
              {estado.uso.ultima_falha && (
                <p className="mt-1 text-destructive" data-testid="audio-ultima-falha">
                  {`${t("Última falha em conversa real:")} ${estado.uso.ultima_falha.mensagem} (${new Date(estado.uso.ultima_falha.em).toLocaleString(tag)}). ${t("Nessas conversas a resposta saiu em texto.")}`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
