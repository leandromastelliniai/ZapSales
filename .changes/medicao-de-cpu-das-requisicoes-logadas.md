---
impacto: capacidade_nova
secao: adicionado
titulo: Comando documentado para saber se a VPS está limitando a CPU de um serviço
---

O guia de produção (`docs/runbooks/deploy.md`, §6) passa a trazer, passo a passo e somente
leitura, como conferir se o login, o REST ou o armazenamento estão sendo cortados pelo teto de
CPU: o teto em vigor (`cpu.max`) e quantas vezes o kernel parou o serviço (`nr_throttled` e
`throttled_usec`), comparando antes e depois de uma rajada. Junto vem o diagnóstico da
lentidão de requisições logadas, com os números medidos e o que foi descartado.
