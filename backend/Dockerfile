# Usar imagen oficial de Node.js
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./

# ---- dev (default, used by docker-compose.yml, unchanged behavior) ----
FROM base AS dev

RUN npm install
RUN npm install -g nodemon ts-node typescript

COPY . .

RUN addgroup -S app && adduser -S app -G app \
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

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

EXPOSE 8000

CMD ["npm", "run", "start"]
