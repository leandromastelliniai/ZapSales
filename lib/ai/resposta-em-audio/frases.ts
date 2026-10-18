/**
 * As FRASES da resposta em áudio — o que o dono do negócio lê quando a voz não
 * saiu. Chaves em português, como o resto do dicionário (`lib/i18n/dicionario.ts`):
 * quem desenha passa por `t()` / `traduzir()`.
 *
 * Mora num módulo sem import para ir ao navegador e à API sem arrastar o
 * servidor. Cada motivo do vocabulário (`tipos.ts`, `decisao.ts`) tem a sua frase
 * — `Record` exaustivo: motivo novo sem frase não compila.
 */
import type { MotivoDeTexto } from "./decisao";
import type { MotivoDeFalhaDeVoz } from "./tipos";

/** Falha de voz (o provedor, a conversão, o Storage) — a frase que diz o que fazer. */
export const FRASE_DA_FALHA_DE_VOZ: Record<MotivoDeFalhaDeVoz | "armazenamento_falhou", string> = {
  chave_invalida:
    "O provedor de voz recusou a chave. Confira se ela está inteira e se é a chave deste provedor.",
  sem_creditos:
    "A conta do provedor de voz está sem créditos ou sem saldo. Recarregue lá e tente de novo.",
  limite_de_uso: "O provedor de voz atingiu o limite de uso por agora. Tente de novo em instantes.",
  voz_inexistente:
    "A voz ou o modelo escolhido não existe nesta conta do provedor. Escolha outro.",
  indisponivel: "Não consegui falar com o provedor de voz agora. Tente de novo em instantes.",
  resposta_invalida:
    "O provedor de voz respondeu algo que não é um áudio. Confira o endereço e o modelo.",
  endereco_recusado:
    "Este endereço não pode ser usado: endereços da rede interna, privada ou local são recusados por segurança.",
  conversao_falhou:
    "Não consegui converter o áudio em nota de voz. O servidor precisa do programa ffmpeg, que a imagem do produto já traz.",
  recusado: "O provedor de voz recusou o pedido.",
  armazenamento_falhou: "Não consegui guardar o áudio no armazenamento do servidor.",
};

/** Por que a resposta saiu em TEXTO (a prévia do agente e o registro do turno). */
export const FRASE_DO_TEXTO: Record<MotivoDeTexto, string> = {
  desligado_na_organizacao: "A resposta em áudio está desligada na organização.",
  desligado_no_agente: "Este agente não responde em áudio.",
  cliente_nao_mandou_audio: "O cliente escreveu, então a resposta sai em texto.",
  canal_sem_nota_de_voz: "O número desta conversa não entrega nota de voz.",
  sem_chave: "Não há chave de voz gravada para o provedor escolhido.",
  texto_vazio: "Não há texto para converter em áudio.",
  texto_longo_demais: "O texto passa do limite de caracteres da resposta em áudio e sai como texto.",
  sem_voz_escolhida: "Este agente ainda não tem uma voz escolhida.",
};

/** A frase de qualquer motivo que a API/tela receba, inclusive o desconhecido. */
export function fraseDoMotivo(motivo: string): string {
  const falha = (FRASE_DA_FALHA_DE_VOZ as Record<string, string>)[motivo];
  if (falha) return falha;
  const texto = (FRASE_DO_TEXTO as Record<string, string>)[motivo];
  if (texto) return texto;
  return "A voz falhou por um motivo que não reconheço. A resposta saiu em texto.";
}
