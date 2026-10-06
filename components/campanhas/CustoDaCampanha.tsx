"use client";
/**
 * O CUSTO da campanha oficial na tela (issue #10): a estimativa antes do
 * disparo, o campo do teto, o relatório depois e o aviso de pausa automática.
 *
 * Os números chegam prontos da API (`lib/custo/relatorio.ts`); aqui só se
 * formata e se diz o que cada um significa. Custo por lead "—" quando ninguém
 * respondeu: zero leria como "saiu de graça".
 */
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustoDaCampanha, type CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";
import { useT } from "@/hooks/i18n/useT";
import type { EstimativaDeCusto } from "@/lib/custo/estimativa";
import { emReais, precoUnitario } from "@/lib/custo/formato";
import { ROTULO_DA_CATEGORIA } from "@/lib/custo/tabela-de-precos";

/** A linha da estimativa: total, quantas, a que preço — e quem ficou sem preço. */
export function LinhaDaEstimativa({ estimativa }: { estimativa: EstimativaDeCusto }) {
  const t = useT();
  const unico = estimativa.por_pais.length === 1 ? estimativa.por_pais[0] : null;
  return (
    <div className="space-y-1 text-sm" data-testid="estimativa-de-custo">
      <p>
        {t("Custo estimado pela tabela da Meta")}: <strong>{emReais(estimativa.total_cents)}</strong>
        {unico
          ? ` · ${unico.quantidade} × ${precoUnitario(unico.unit_price_cents)} (${t(ROTULO_DA_CATEGORIA[estimativa.categoria])})`
          : ` · ${estimativa.mensagens} ${t("mensagens")} (${t(ROTULO_DA_CATEGORIA[estimativa.categoria])})`}
      </p>
      {estimativa.sem_preco > 0 && (
        <p className="text-warning-fg">
          {estimativa.sem_preco} {t("destinatários são de países sem preço na tabela e não entram na estimativa.")}
        </p>
      )}
    </div>
  );
}

/** O campo do teto de gasto da campanha, em reais. */
export function CampoDoTetoDeGasto({
  id,
  valor,
  onChange,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("Teto de gasto da Meta nesta campanha (R$)")}</Label>
      <Input id={id} inputMode="decimal" placeholder={t("Sem teto")} value={valor} onChange={(e) => onChange(e.target.value)} />
      <p className="text-sm text-muted-foreground">
        {t("Ao chegar no teto, a campanha pausa sozinha e diz por quê. O teto mensal da empresa, em Campanhas › Configuração, vale junto.")}
      </p>
    </div>
  );
}

/** A campanha pausou sozinha: o motivo, em destaque, antes de tudo. */
export function AvisoDePausaAutomatica({ campanha }: { campanha: CampanhaDetalhada }) {
  const t = useT();
  if (campanha.status !== "paused" || !campanha.pausa_motivo) return null;
  return (
    <Card className="space-y-1 border-warning-fg p-4" role="status" data-testid="pausa-automatica">
      <h2 className="font-medium">{t("Pausada automaticamente")}</h2>
      <p className="text-sm">{campanha.pausa_detalhe ?? t("O sistema pausou esta campanha.")}</p>
    </Card>
  );
}

function Linha({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        {rotulo}
        {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
      </span>
      <span className="shrink-0 font-medium tabular-nums">{valor}</span>
    </div>
  );
}

/** O relatório de custo da campanha oficial. */
export function CustoDaCampanha({ campanha }: { campanha: CampanhaDetalhada }) {
  const t = useT();
  const custo = useCustoDaCampanha(campanha.id, campanha);
  if (!campanha.meta_template_id) return null;
  if (custo.isPending) return <Skeleton className="h-40 w-full" />;
  if (custo.isError || !custo.data) {
    return (
      <Card className="p-4">
        <p className="text-sm text-error-fg">{t("Não foi possível carregar o custo da campanha.")}</p>
      </Card>
    );
  }
  const c = custo.data;
  const naoSaiu = c.mensagens_com_custo === 0;
  return (
    <Card className="space-y-3 p-4" data-testid="custo-da-campanha">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{t("Custo")}</h2>
        {c.teto_gasto_cents !== null && (
          <span className="text-sm text-muted-foreground">
            {t("Teto da campanha")}: {emReais(c.teto_gasto_cents)}
          </span>
        )}
      </div>

      {c.estimativa && naoSaiu && <LinhaDaEstimativa estimativa={c.estimativa} />}

      {!naoSaiu && (
        <div className="divide-y divide-border">
          <Linha
            rotulo={t("Custo da Meta")}
            valor={emReais(c.meta_cents)}
            {...(c.meta_estimado_cents > 0
              ? { dica: `${emReais(c.meta_estimado_cents)} ${t("ainda estimados: a Meta confirma pelo webhook de entrega.")}` }
              : {})}
          />
          <Linha
            rotulo={t("Custo de IA")}
            valor={emReais(c.ia_cents)}
            dica={`${t("Atendimento do agente a quem recebeu, na janela de resposta. Cotação")} US$ 1 = ${emReais(c.cotacao_usd_brl * 100)}${c.cotacao_de_referencia ? ` (${t("referência")})` : ""}`}
          />
          <Linha rotulo={t("Total")} valor={emReais(c.total_cents)} />
          <Linha
            rotulo={t("Custo por lead que respondeu")}
            valor={c.custo_por_lead_que_respondeu_cents === null ? "—" : emReais(c.custo_por_lead_que_respondeu_cents)}
            dica={`${c.responderam} ${c.responderam === 1 ? t("pessoa respondeu") : t("pessoas responderam")}`}
          />
          <Linha
            rotulo={t("Conversas vindas de anúncio (janela grátis)")}
            valor={String(c.conversas_de_anuncio)}
            dica={t("Quem chegou por anúncio Click-to-WhatsApp: a Meta não cobra a mensagem dentro dessa janela.")}
          />
          {c.mensagens_sem_preco > 0 && (
            <p className="py-1.5 text-sm text-warning-fg">
              {c.mensagens_sem_preco} {t("mensagens cobradas são de países sem preço na tabela e não entram no total.")}
            </p>
          )}
        </div>
      )}
      {c.estimativa && !naoSaiu && (
        <p className="text-xs text-muted-foreground">
          {t("Estimativa da lista inteira")}: {emReais(c.estimativa.total_cents)}
        </p>
      )}
    </Card>
  );
}
