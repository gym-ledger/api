-- An append-only history of what each user agreed to and when, so we can
-- show which terms/privacy version someone accepted on a given date (GDPR
-- Art. 7(1), India's DPDP Act). Rows are only ever inserted, never updated.
-- users.privacy_policy_version / privacy_policy_accepted_at and
-- users.ai_checkins_enabled / ai_checkins_consented_at stay as a cache of the
-- latest state.
--
--   kind     'privacy_policy'  the terms of use + privacy policy (accepted together)
--            'ai_checkins'     the AI weekly check-in opt-in
--   action   'accepted' | 'withdrawn' (withdrawn: AI check-ins turned off)
--   version  the policy version in force when it happened (src/config/policyVersions.ts)
--   source   where it happened: 'prompt' (the accept screen), 'notice' (dismissed
--            a "policy updated" notice), 'ai_consent' (the AI consent sheet),
--            'settings', or 'backfill' (copied from users when this table was made)
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    kind VARCHAR(20) NOT NULL
        CHECK (kind IN ('privacy_policy', 'ai_checkins')),

    action VARCHAR(10) NOT NULL
        CHECK (action IN ('accepted', 'withdrawn')),

    version VARCHAR(20),

    source VARCHAR(20) NOT NULL
        CHECK (source IN ('prompt', 'notice', 'ai_consent', 'settings', 'backfill')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_created
ON user_consents (user_id, created_at);

-- What was already known: each user's latest acceptance and AI opt-in.
INSERT INTO user_consents (user_id, kind, action, version, source, created_at)
SELECT id, 'privacy_policy', 'accepted', privacy_policy_version, 'backfill', privacy_policy_accepted_at
FROM users
WHERE privacy_policy_version IS NOT NULL
    AND privacy_policy_accepted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM user_consents c WHERE c.user_id = users.id AND c.kind = 'privacy_policy');

INSERT INTO user_consents (user_id, kind, action, version, source, created_at)
SELECT id, 'ai_checkins', 'accepted', privacy_policy_version, 'backfill', ai_checkins_consented_at
FROM users
WHERE ai_checkins_enabled
    AND ai_checkins_consented_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM user_consents c WHERE c.user_id = users.id AND c.kind = 'ai_checkins');
