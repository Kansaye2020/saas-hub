# ==============================================================================
# ÉTAPE 1 : Compilation TypeScript (Builder)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Outils nécessaires pour d'éventuels modules natifs
RUN apk add --no-cache python3 make g++

# Installation des dépendances
COPY package*.json ./
RUN npm ci

# Copie des fichiers sources et compilation
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ==============================================================================
# ÉTAPE 2 : Image finale de production ultra-légère (Runner)
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Installation des dépendances de production uniquement
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copie des fichiers compilés et des templates
COPY --from=builder /app/dist ./dist
COPY views ./views
COPY public ./public

# Création du dossier data pour le stockage local SQLite si utilisé en fallback
RUN mkdir -p /app/data

EXPOSE 4000

# Démarrage du serveur
CMD ["node", "dist/server.js"]
