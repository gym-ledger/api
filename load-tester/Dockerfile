# The load generator and the dashboard (same image, different command; see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# No runtime dependencies: Node's own fetch, http and test runner are enough.
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY ui ./ui
COPY configs ./configs
RUN mkdir -p runs && chown node:node runs
USER node
CMD ["node", "dist/cli.js"]
