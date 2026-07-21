FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend frontend
RUN pnpm --dir frontend build
RUN test -f /app/frontend/.next/standalone/frontend/server.js
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/frontend/.next/standalone/frontend ./
COPY --from=build /app/frontend/.next/static ./.next/static
COPY --from=build /app/frontend/public ./public
CMD ["node", "server.js"]
