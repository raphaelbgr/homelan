FROM node:22-alpine
WORKDIR /app
COPY packages/relay/package.json ./
COPY packages/shared/dist ./node_modules/@homelan/shared/dist
RUN npm install --omit=dev
COPY packages/relay/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
