"use client";
/**
 * "CONECTAR COM FACEBOOK" — Embedded Signup v4 (issue #5).
 *
 * Só é montado quando a instalação ligou a chave (a rota devolve
 * `embeddedSignup` não nulo). O fluxo:
 *   1. a pessoa escolhe o PIN e o uso ANTES de abrir a janela — o código que a
 *      Meta devolve vale 30 segundos, e não dá tempo de perguntar depois;
 *   2. o SDK da Meta abre o login com o `config_id` da configuração de
 *      Embedded Signup; a janela anuncia por `postMessage` (origem facebook.com)
 *      a WABA e o número escolhidos, e o `FB.login` devolve o CÓDIGO;
 *   3. código + ids vão ao NOSSO servidor, que troca o código pelo token com o
 *      App Secret e conecta. Nada de segredo passa por aqui.
 *
 * `extras.setup` é o que a documentação do v4 mostra; `version` e
 * `sessionInfoVersion` vão junto como a Meta os usou nas versões anteriores — a
 * versão efetiva é a da configuração de login cadastrada no painel da Meta.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConectarPeloEmbeddedSignup } from "@/hooks/channels/useOfficialChannel";
import { useT } from "@/hooks/i18n/useT";
import { graphVersion } from "@/lib/graph-version";
import type { UsoDoNumero } from "@/lib/channels/uso";

import { USOS_NA_TELA } from "./rotulos-do-numero";

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FbSdk {
  init(opcoes: Record<string, unknown>): void;
  login(callback: (r: FbLoginResponse) => void, opcoes: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

const SRC_DO_SDK = "https://connect.facebook.net/en_US/sdk.js";

/** Carrega o SDK uma vez por página e o inicializa com o app da instalação. */
function carregarSdk(appId: string): Promise<FbSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      if (!window.FB) return reject(new Error("sdk_sem_fb"));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion() });
      resolve(window.FB);
    };
    if (document.querySelector(`script[src="${SRC_DO_SDK}"]`)) return;
    const s = document.createElement("script");
    s.src = SRC_DO_SDK;
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("sdk_nao_carregou"));
    document.body.appendChild(s);
  });
}

interface DadosDoSignup {
  waba_id?: string;
  phone_number_id?: string;
}

export function EmbeddedSignupOficial({ appId, configId }: { appId: string; configId: string }) {
  const t = useT();
  const conectar = useConectarPeloEmbeddedSignup();
  const [pin, setPin] = useState("");
  const [uso, setUso] = useState<UsoDoNumero | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const dados = useRef<DadosDoSignup>({});
  const codigo = useRef<string | null>(null);
  // O PIN e o uso NO MOMENTO do clique: o código chega depois, e o estado do
  // React lido dentro do callback seria o da renderização em que ele nasceu.
  const escolhas = useRef<{ pin: string; uso: UsoDoNumero } | null>(null);

  async function talvezConectar() {
    const { waba_id, phone_number_id } = dados.current;
    const code = codigo.current;
    const e = escolhas.current;
    if (!code || !waba_id || !phone_number_id || !e) return;
    codigo.current = null;
    try {
      const r = await conectar.mutateAsync({ code, waba_id, phone_number_id, pin: e.pin, uso: e.uso });
      toast.success(`${t("Conectado:")} ${r.data.displayName} ${r.data.phoneNumber ?? ""}`.trim());
      setPin("");
    } catch {
      // O motivo (código vencido, PIN errado) já foi mostrado pelo `onError` do hook.
    } finally {
      setAbrindo(false);
    }
  }

  useEffect(() => {
    function aoReceber(evento: MessageEvent) {
      // Só a Meta fala aqui; qualquer outra origem é ignorada.
      let origem: URL;
      try {
        origem = new URL(evento.origin);
      } catch {
        return;
      }
      if (origem.hostname !== "facebook.com" && !origem.hostname.endsWith(".facebook.com")) return;
      let msg: { type?: string; event?: string; data?: DadosDoSignup & { current_step?: string; error_message?: string } };
      try {
        msg = typeof evento.data === "string" ? JSON.parse(evento.data) : evento.data;
      } catch {
        return;
      }
      if (msg?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (msg.event === "FINISH" && msg.data) {
        dados.current = { waba_id: msg.data.waba_id, phone_number_id: msg.data.phone_number_id };
        void talvezConectar();
      } else if (msg.event === "CANCEL" || msg.event === "ERROR") {
        setAbrindo(false);
        toast.error(msg.data?.error_message ?? t("O cadastro na Meta foi interrompido antes do fim."));
      }
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
    // `talvezConectar` lê só refs; o efeito monta o ouvinte uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrir() {
    if (pin.length !== 6 || !uso) return;
    escolhas.current = { pin, uso };
    dados.current = {};
    codigo.current = null;
    setAbrindo(true);
    try {
      const fb = await carregarSdk(appId);
      fb.login(
        (r) => {
          const code = r.authResponse?.code;
          if (!code) {
            setAbrindo(false);
            return;
          }
          codigo.current = code;
          void talvezConectar();
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, version: "v4", sessionInfoVersion: "3" },
        },
      );
    } catch {
      setAbrindo(false);
      toast.error(t("Não consegui abrir o login da Meta. Confira se o navegador não está bloqueando a janela."));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="embedded-signup">
      <div>
        <h2 className="font-medium">{t("Conectar com Facebook")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("O jeito mais curto: você entra com a sua conta do Facebook, escolhe a empresa e o número, e o sistema conecta sozinho.")}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="es-pin">{t("PIN de confirmação em duas etapas")}</Label>
        <Input
          id="es-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-40 font-mono tracking-widest"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("Para que serve este número?")}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {USOS_NA_TELA.map((u) => (
            <label key={u.valor} className="flex items-center gap-2">
              <input
                type="radio"
                name="es-uso"
                value={u.valor}
                checked={uso === u.valor}
                onChange={() => setUso(u.valor)}
              />
              {t(u.rotulo)}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Button
          onClick={() => void abrir()}
          disabled={abrindo || conectar.isPending || pin.length !== 6 || !uso}
          data-testid="embedded-signup-abrir"
        >
          {abrindo || conectar.isPending ? t("Conectando…") : t("Conectar com Facebook")}
        </Button>
      </div>
    </Card>
  );
}
