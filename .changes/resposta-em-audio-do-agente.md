---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode responder em áudio quando o cliente manda áudio
---

O agente já entendia o áudio que o cliente manda; agora ele também pode **responder em nota de voz**. O recurso é **opcional e vem desligado**: nada muda para quem não ligar, e uma instalação sem nenhuma chave de voz continua funcionando como antes.

Para usar, um administrador abre **Agente de IA › Provedores › Resposta em áudio**, escolhe o provedor de voz (compatível com a API de fala da OpenAI, ou ElevenLabs), cola a **chave de voz da própria empresa** (guardada cifrada e nunca mostrada de novo), toca em **Testar**, marca que concorda em enviar o texto das respostas ao provedor e liga. Depois, em cada agente, a opção **Responder em áudio quando o cliente mandar áudio** (desligada por padrão); com a ElevenLabs, o agente escolhe a voz na lista da conta do cliente.

O texto da resposta passa por todas as conferências antes do envio (opt-out, LGPD, ritmo, janela de 24 horas) e **só depois** vira nota de voz; o texto fica sempre gravado na conversa. Se a voz falhar (chave recusada, conta sem créditos, provedor fora do ar), a resposta sai em texto, e a tela de configuração mostra a última falha. Em número conectado por QR code, o editor avisa que áudio automático aumenta o risco de banimento. O custo e o limite de caracteres aparecem em **Uso de IA**.
