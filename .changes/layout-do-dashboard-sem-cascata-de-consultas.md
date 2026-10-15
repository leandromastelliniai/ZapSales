---
impacto: nada_mudou
secao: alterado
titulo: Abrir uma tela logada espera menos consultas em fila
---

O layout do aplicativo deixa de esperar consultas que não dependem uma da outra: a marca da
instalação, o tema da organização e a leitura da política de verificação em duas etapas passam a
rodar junto com as demais, e o tempo de cada navegação cai para o da mais lenta, e não mais a soma.
Nada muda para quem usa: os mesmos redirecionamentos (login, acesso revogado, organização suspensa,
onboarding) e as mesmas guardas continuam valendo.

Quem opera a VPS passa a ver no log do servidor uma linha `[layout] renderização lenta`, com a
duração em milissegundos, sempre que o layout de uma tela leva 300 ms ou mais. O cabeçalho
`Server-Timing` não consegue carregar essa etapa, porque ele é escrito antes de a tela ser montada.
