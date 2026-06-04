FROM node:20-alpine

WORKDIR /app

# Instala dependencias (imapflow, mailparser) primeiro pra aproveitar cache.
COPY app/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia o codigo do app.
COPY app/ ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
