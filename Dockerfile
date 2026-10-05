FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit && npm cache clean --force
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate && npm run build && rm -rf .next/cache
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
