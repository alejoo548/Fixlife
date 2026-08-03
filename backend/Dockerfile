# Usar imagen oficial de Node.js
FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# ---- dev (default, used by docker-compose.yml, unchanged behavior) ----
FROM base AS dev

RUN npm install
RUN npm install -g nodemon ts-node typescript

COPY . .

RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app

USER app

EXPOSE 8000

CMD ["npm", "run", "dev"]

# ---- prod (compiled JS, no ts-node/nodemon, used by docker-compose.prod.yml) ----
FROM base AS prod

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build \
    && npm prune --omit=dev

RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app

USER app

EXPOSE 8000

CMD ["npm", "run", "start"]
