ARG BUILD_FROM
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Install jq to read HA options.json
RUN apt-get update && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Screenshots directory
RUN mkdir -p /app/screenshots

CMD ["npx", "tsx", "src/index.ts"]
