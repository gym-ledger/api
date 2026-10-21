# Nightly encrypted Postgres backups to S3-compatible storage (BACKUPS.md).
# The Postgres client tools match the server's major version (16).
FROM postgres:16-alpine

RUN apk add --no-cache aws-cli age curl

COPY --chmod=755 backup.sh entrypoint.sh /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
