-- migration: payment_url_https_only (applied)
-- The payment link is shown to every visitor as a button, so only a plain https URL may be stored
-- (no javascript:, data: or http:, no spaces or quote characters, at most 500 characters).
alter table public.site_settings add constraint site_settings_payment_url_https
  check (key <> 'payment_url' or value is null
         or (length(value) <= 500 and value ~ '^https://[^[:space:]"''<>]+$'));
