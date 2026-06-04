FROM node:20-alpine

WORKDIR /app

# App sem dependencias npm (Node puro) — copiamos so o codigo.
COPY app/ ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
