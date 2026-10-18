-- GoTrue não lê usuário inserido à mão com colunas de token nulas; preenche com string vazia.
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email like '%@equipe-demo.example.com';
select email, raw_user_meta_data->>'full_name' from auth.users where email like '%@equipe-demo.example.com';
