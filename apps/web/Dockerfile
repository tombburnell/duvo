FROM node:22.21-alpine AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN if [ ! -f package-lock.json ]; then \
  echo >&2 "ERROR: ./package-lock.json missing in build context."; \
  exit 1; \
fi
RUN npm ci

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN if [ ! -f package-lock.json ]; then \
  echo >&2 "ERROR: ./package-lock.json missing in build context."; \
  exit 1; \
fi
RUN npm ci --omit=dev

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN if [ ! -d public ]; then \
  echo >&2 "ERROR: ./public directory missing after COPY."; \
  exit 1; \
fi
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next

USER node
EXPOSE 3000

CMD ["npm", "run", "start"]
