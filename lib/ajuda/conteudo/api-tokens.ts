import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma
 * (`Criar token` / `Crear token` / `Create token`, `Escopos` / `Alcances` / `Scopes`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você cria chaves de acesso para que outros sistemas conversem com este. Só administradores abrem esta tela. O texto de cada chave aparece uma única vez, na hora em que é criada.",
    passos: [
      "Use Criar token, dê um Nome que lembre para que serve a chave e marque os Escopos, que são as permissões dela.",
      "Se quiser, preencha Expira em (dias) — opcional. Sem isso, a chave não tem data para vencer. Depois use Criar.",
      "Na janela Token criado, use Copiar para clipboard e guarde a chave em lugar seguro. Depois de fechar, ela não aparece mais.",
      "Na lista, cada chave mostra o Prefixo (o começo dela), os Escopos, se está Ativo ou Revogado e quando Expira.",
      "Se a chave vazou ou não é mais usada, clique em Revogar na linha dela. Quem usar uma chave revogada deixa de ter acesso.",
    ],
    termos: [
      { termo: "Token", significa: "A chave de acesso. Quem tiver o texto dela consegue usar o que os escopos permitem, então guarde como uma senha." },
      { termo: "Escopos", significa: "As permissões da chave, como ler contatos ou enviar mensagens. Marque só o que o outro sistema precisa." },
      { termo: "Prefixo", significa: "O começo da chave, mostrado na lista só para você reconhecer qual é qual." },
      { termo: "Revogar", significa: "Cancelar a chave para sempre. Ela continua na lista como Revogado." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí creas claves de acceso para que otros sistemas conversen con este. Solo los administradores abren esta pantalla. El texto de cada clave aparece una sola vez, en el momento en que se crea.",
    passos: [
      "Usa Crear token, pon un Nombre que recuerde para qué sirve la clave y marca los Alcances, que son sus permisos.",
      "Si quieres, completa Expira en (días) — opcional. Sin eso, la clave no tiene fecha de vencimiento. Luego usa Crear.",
      "En la ventana Token creado, usa Copiar al portapapeles y guarda la clave en un lugar seguro. Al cerrarla, ya no aparece.",
      "En la lista, cada clave muestra el Prefijo (su inicio), los Alcances, si está Activo o Revocado y cuándo Expira.",
      "Si la clave se filtró o ya no se usa, haz clic en Revocar en su fila. Quien use una clave revocada pierde el acceso.",
    ],
    termos: [
      { termo: "Token", significa: "La clave de acceso. Quien tenga su texto puede usar lo que permiten los alcances, así que guárdala como una contraseña." },
      { termo: "Alcances", significa: "Los permisos de la clave, como leer contactos o enviar mensajes. Marca solo lo que el otro sistema necesita." },
      { termo: "Prefijo", significa: "El inicio de la clave, mostrado en la lista solo para que reconozcas cuál es cuál." },
      { termo: "Revocar", significa: "Cancelar la clave para siempre. Sigue en la lista como Revocado." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you create access keys so other systems can talk to this one. Only administrators can open this screen. The text of each key appears only once, at the moment it is created.",
    passos: [
      "Use Create token, give it a Name that reminds you what the key is for, and tick the Scopes, which are its permissions.",
      "If you want, fill in Expires in (days) — optional. Without it, the key has no expiry date. Then use Create.",
      "In the Token created window, use Copy to clipboard and keep the key somewhere safe. Once you close it, it never appears again.",
      "In the list, each key shows its Prefix (the start of it), its Scopes, whether it is Active or Revoked and when it Expires.",
      "If a key leaked or is no longer used, click Revoke on its row. Anyone using a revoked key loses access.",
    ],
    termos: [
      { termo: "Token", significa: "The access key. Whoever has its text can do whatever the scopes allow, so keep it like a password." },
      { termo: "Scopes", significa: "The key's permissions, such as reading contacts or sending messages. Tick only what the other system needs." },
      { termo: "Prefix", significa: "The start of the key, shown in the list only so you can tell which is which." },
      { termo: "Revoke", significa: "Cancel the key for good. It stays in the list as Revoked." },
    ],
  },
};

export default ajuda;
