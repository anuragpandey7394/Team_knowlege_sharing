FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/config/package.json packages/config/package.json
COPY --chown=node:node packages/contracts/package.json packages/contracts/package.json
RUN npm ci --cache /tmp/tka-npm-cache && rm -rf /tmp/tka-npm-cache
COPY --chown=node:node . .
RUN npm run build
FROM build AS migration
CMD ["node", "scripts/production-migrate.mjs"]
FROM build AS dependencies
RUN npm prune --omit=dev --cache /tmp/tka-prune-cache && rm -rf /tmp/tka-prune-cache
FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS api
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
FROM nginx:stable-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949 AS web
RUN apk add --no-cache curl
COPY infra/production/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 1000:1000
EXPOSE 8443
ENTRYPOINT ["nginx", "-g", "daemon off;"]
