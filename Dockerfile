# Stage 1: Build the SvelteKit application
# Pinned by multi-arch index digest for golden-card reproducibility; a single
# global ARG feeds both stages so a refresh cannot leave them out of sync.
# Refresh deliberately with `docker buildx imagetools inspect <image:tag>`.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runtime - no npm, no source code, just the compiled output
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "build"]
