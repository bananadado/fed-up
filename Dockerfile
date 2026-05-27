FROM node:24-bookworm-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf

ARG BUN_VERSION=1.3.2

ENV APP_DEPS_DIR=/opt/drp03
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR ${APP_DEPS_DIR}

COPY package.json bun.lock ./
COPY functions/package.json functions/bun.lock ./functions/

RUN npm install --global "bun@${BUN_VERSION}" --silent \
  && node --version \
  && npm --version \
  && bun --version \
  && bun install --frozen-lockfile --omit peer \
  && cd functions \
  && bun install --frozen-lockfile --omit peer \
  && cd .. \
  && rm -rf /root/.npm /root/.bun/install/cache /tmp/*

WORKDIR /workspace
