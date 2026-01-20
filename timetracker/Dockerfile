FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY src/ ./src/
COPY public/ ./public/

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
