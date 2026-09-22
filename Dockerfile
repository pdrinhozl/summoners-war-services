FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node", "server.js"]
