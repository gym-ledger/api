-- Privacy policy acceptance and the AI check-in opt-in.
--
-- privacy_policy_version is the version the user last accepted
-- (PRIVACY_POLICY_VERSION in config/constants.ts). The web app asks again
-- whenever it differs from the current one, existing users included.
--
-- AI weekly check-ins are off until the user turns them on after reading what
-- is sent to the model provider. Everyone starts off, including users who
-- had check-ins before this migration: none of them had agreed to it.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(20),
    ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_checkins_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_checkins_consented_at TIMESTAMPTZ;
