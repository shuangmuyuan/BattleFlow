FROM public.ecr.aws/docker/library/node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends git unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.0.0 @anthropic-ai/claude-code

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 5001

CMD ["node", "dist/server.js"]
