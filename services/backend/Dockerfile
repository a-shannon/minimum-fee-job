FROM node:22.18 AS minimum-fee-job-builder
RUN npm i -g npm@11.6.2
WORKDIR /app
COPY package*.json ./
COPY services/backend/package.json ./services/backend/
COPY packages/token-price-entity/package.json ./packages/token-price-entity/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . /app
RUN npm run build --workspace=packages/token-price-entity

FROM node:22.18
RUN npm i -g npm@11.6.2
COPY --from=minimum-fee-job-builder /app/node_modules/ /app/node_modules/
COPY --from=minimum-fee-job-builder /app/package*.json /app/
COPY --from=minimum-fee-job-builder /app/services/backend/ /app/services/backend/
COPY --from=minimum-fee-job-builder /app/packages/token-price-entity /app/packages/token-price-entity
ENV NODE_ENV=production
WORKDIR /app/services/backend/

CMD ["npm", "run", "start"]
