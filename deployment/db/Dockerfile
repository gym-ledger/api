# Build stage: dev dependencies and the TypeScript compiler stay here.
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Runtime stage: production dependencies, the compiled app, the SQL
# migrations and the exercise seed. Runs as the unprivileged "node" user.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Node reads package.json at runtime ("type": "module").
COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Owned by "node" so it can read them whatever their mode on disk: the
# server's deploy script checks files out with umask 077 (root-only).
COPY --chown=node:node src/db/migrations ./src/db/migrations
COPY --chown=node:node seeds ./seeds
COPY --chmod=755 entrypoint.sh ./

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:4000/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/server.js"]
