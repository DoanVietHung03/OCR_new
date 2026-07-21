FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend frontend
RUN pnpm --dir frontend build
RUN test -f /app/frontend/.next/standalone/frontend/server.js
RUN test -f /app/frontend/.next/standalone/frontend/node_modules/next/package.json
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
RUN test -f /app/frontend/server.js
RUN test -f /app/frontend/node_modules/next/package.json
ENV HOSTNAME=0.0.0.0
ENV PORT=54846
CMD ["node", "frontend/server.js"]
