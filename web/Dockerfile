# HD-Search web (Next.js) — multi-stage build using Next standalone output.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next standalone binds to $HOSTNAME; Docker defaults it to the container id, so
# without this the server listens on the container IP only and the loopback
# healthcheck fails. Bind to all interfaces.
ENV HOSTNAME=0.0.0.0
# Next standalone bundle (server + minimal node_modules) + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/content ./content
# uid 10001 matches the API container so the shared /secrets file (written 0600 by
# the API) is readable here; /secrets is a shared volume for auto-generated secrets.
RUN useradd -r -u 10001 hdweb \
  && mkdir -p /secrets && chown hdweb:hdweb /secrets \
  && chown -R hdweb /app
USER hdweb
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
