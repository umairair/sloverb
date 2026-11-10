FROM node:24-bookworm-slim AS javascript
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 2.0.2 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
    && test "$(git -C /opt/bgutil rev-parse HEAD)" = "26475e9d3665b972c4aeb83b4dbaafcf64b88438"
WORKDIR /opt/bgutil/server
COPY backend/pot-provider/package-lock.json package-lock.json
RUN npm ci --no-audit --no-fund && npx tsc && npm prune --omit=dev

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
ENV BGUTIL_SERVER_HOME=/opt/bgutil/server XDG_CACHE_HOME=/tmp/sloverb-token-cache
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=javascript /usr/local/bin/node /usr/local/bin/node
COPY --from=javascript /opt/bgutil/server /opt/bgutil/server
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
RUN node --version && ffmpeg -version > /dev/null && python -m yt_dlp --version \
    && node -e "require('/opt/bgutil/server/node_modules/canvas')"
COPY backend /app/backend
RUN useradd --create-home app
USER app
EXPOSE 10000
# One process owns the bounded queue and temporary files. Do not add workers.
CMD ["sh", "-c", "exec uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*' --no-access-log"]
