# Build stage for client
FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Build stage for server
FROM node:20-alpine AS server-builder

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies for server
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy built server
COPY --from=server-builder /app/server/dist ./dist

# Copy built client to serve as static files
COPY --from=client-builder /app/client/dist ./client/dist

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/inquiry.db
ENV UPLOADS_PATH=/app/uploads

EXPOSE 3000

CMD ["node", "dist/index.js"]
