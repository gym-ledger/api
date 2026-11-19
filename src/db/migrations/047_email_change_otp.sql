-- Changing (or adding) the email of a signed-in account.
--
-- email_change_auth: a code to the user's current email (or phone, when they
-- have no email) that confirms it's them, for users without a password.
-- email_change: a code to the new address, proving the user owns it.
ALTER TABLE otp_auth DROP CONSTRAINT IF EXISTS otp_auth_purpose_check;
ALTER TABLE otp_auth ADD CONSTRAINT otp_auth_purpose_check
    CHECK (purpose IN ('login', 'reset_password', 'delete_account', 'email_change_auth', 'email_change'));
