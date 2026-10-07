---
impacto: capacidade_nova
secao: adicionado
titulo: Implantação contínua opcional, com volta automática, pelo kit da VPS
---

O kit passa a instalar o comando `zapsales-implantar`, que leva uma versão da `main` à VPS pela
imagem exata do commit (`sha-<commit>`) e volta sozinho para a versão anterior se algo falhar.
Antes de mudar qualquer coisa ele recusa commit fora da `main`, versão mais antiga que a do ar e
imagem que não corresponde ao commit. Depois de instalar, confere que `/api/v1/health` responde a
versão nova, que nenhuma dependência piorou e que app, worker e agendador ficam 2 minutos sem
reiniciar. O banco não volta: as mudanças de schema só acrescentam.

O comando fica inerte até você autorizar uma chave com `sudo kit/implantar.sh acesso "<chave
pública>"`, que cria um usuário que só pode rodar esse comando, sem terminal nem túnel. O passo a
passo, com o workflow do GitHub que chama o comando a cada merge, está em
`docs/runbooks/deploy.md` §5.

- **Correção:** numa instalação que já tinha construído as imagens na própria VPS, a versão
  mostrada em `/api/v1/health` podia continuar a de uma imagem antiga depois de passar a puxar
  do registro. O kit agora tira essa sobra do `.env`.
- Rodar `kit/instalar.sh` à mão depois de uma implantação contínua mantém a imagem do mesmo
  commit, em vez de voltar para a versão do `package.json`.
