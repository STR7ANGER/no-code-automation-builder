FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/connectors/package.json packages/connectors/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY prisma prisma
COPY packages packages
COPY apps/api apps/api
RUN npx prisma generate && npm run build --workspace @relay/contracts && npm run build --workspace @relay/api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json packages/contracts/package.json
COPY --from=build /app/packages/contracts/schema.graphql packages/contracts/schema.graphql
COPY --from=build /app/prisma prisma
COPY apps/api/package.json apps/api/package.json
COPY package.json package.json
USER node
EXPOSE 3010
CMD ["node", "apps/api/dist/server.js"]
