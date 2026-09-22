FROM node:24-bookworm-slim
WORKDIR /app
ADD sw-service-app.tar.gz /app/
RUN npm ci --omit=dev && npm cache clean --force
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node", "server.js"]
