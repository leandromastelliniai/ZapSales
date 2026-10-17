---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode aprender com o seu site
---

Na **Base de conhecimento**, **Ensinar algo novo ao agente** ganhou um tipo novo: **Site**. Você informa o endereço de uma página, ou de uma lista de páginas (até 20 por fonte), e o agente aprende o texto principal de cada uma — sem menu, rodapé, script nem o que a própria página esconde. O sistema **não percorre o resto do site**: lê exatamente as páginas que você listou.

Cada página mostra o estado em **Ver as páginas**: lida, ou não foi lida e **por quê** (o site respondeu erro, demorou demais, a página é grande demais, o endereço é interno…). Se uma página falha depois de já ter sido lida, o agente continua com o que leu antes e a fonte aparece como "Entrou pela metade". A leitura é **sempre manual**: quando o site mudar, toque em **Ler o site de novo** — as páginas que não mudaram não gastam embedding. O agente cita o nome da página, como já cita o nome dos outros materiais, e você escolhe quais agentes consultam a fonte, como nas demais.

Por segurança, só endereços **https** públicos são lidos: endereços internos, privados ou locais são recusados (toda leitura passa pela mesma política de rede segura da instalação). Os limites (20 páginas, 2 MB e 15 segundos por página) podem ser ajustados no `.env` com `KB_SITE_MAX_PAGES`, `KB_SITE_MAX_BYTES` e `KB_SITE_TIMEOUT_MS`; um `.env` antigo continua funcionando sem essas variáveis. Nada muda nos materiais que você já tem.
