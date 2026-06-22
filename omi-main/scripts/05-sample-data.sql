-- Sample data for testing (optional - comment out if not needed)
-- This creates test users and tasks for development

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change, email_change_token_new, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user)
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6', 'authenticated', 'authenticated', 'test@example.com', crypt('TestPassword123!', gen_salt('bf')), NOW(), NULL, '', NOW(), '', NOW(), '', '', NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"pin_hash":"1234"}', false, NOW(), NOW(), NULL, NULL, '', '', NOW(), NULL, '', NOW(), false)
ON CONFLICT DO NOTHING;
