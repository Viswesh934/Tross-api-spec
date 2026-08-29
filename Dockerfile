FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package management files
COPY package*.json ./

# Install all dependencies needed for build
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist/
RUN npm run build

# Remove devDependencies to keep image lean
RUN npm prune --production

# Expose port (Render sets $PORT dynamically)
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
