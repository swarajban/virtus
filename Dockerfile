# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/client/public ./client/public

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
