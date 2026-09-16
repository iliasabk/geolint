# geolint MCP server — stdio transport, no secrets required.
#   docker build -t geolint .
#   docker run -i --rm geolint            # starts `geolint mcp`
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
ENTRYPOINT ["node", "dist/cli.js", "mcp"]
