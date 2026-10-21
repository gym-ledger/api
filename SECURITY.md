# Security policy

This project has three repositories that work together: the API
(`gym-ledger/api`), the user web app (`gym-ledger/web`) and the admin panel
(`gym-ledger/admin`). This policy covers all three.

## Supported versions

Only the latest commit on `main` gets security fixes.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security
problem.**

Report it privately through GitHub: open the **Security** tab of the affected
repository and choose **Report a vulnerability**
(https://github.com/gym-ledger/api/security/advisories/new). If you're not
sure which repository it belongs to, report it on `gym-ledger/api`.

Please include:

- what is affected (repository, endpoint or page, and commit if you know it)
- steps to reproduce, or a proof of concept
- what an attacker could do with it

You'll get a reply as soon as possible, usually within a week. Once a fix is
out, the advisory is published and you're credited, unless you'd rather not be.

## Scope

In scope: the code in these repositories, and the default configuration in their
`deployment/` and `stack/` folders.

Out of scope: someone else's self-hosted instance (report it to whoever runs it),
problems that need an already-compromised server or admin account, and missing
hardening with no demonstrated impact.

Please test only against an instance you run yourself, never against other
people's accounts or data.
