# Agent MIP : image minimale de production.
# Construction : docker build -t agent-mip .
# Lancement    : voir README, section "Installer en une commande".
FROM node:22-alpine

WORKDIR /app

# dependances d'abord : couche en cache tant que package*.json ne bouge pas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# le serveur et ses ressources ; ni .env (secrets montes au lancement),
# ni tests, ni banc d'evaluation
COPY server.js ./
COPY src ./src
COPY public ./public
COPY examples ./examples

# journal des sessions : a monter en volume pour survivre au conteneur
VOLUME /app/logs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
