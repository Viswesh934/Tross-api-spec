FROM node:22-alpine

WORKDIR /app

# Copy package management files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy TypeScript configuration, source files, and fixtures
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist/
RUN npm run build

# Remove devDependencies to keep final image clean and minimal (~120MB)
RUN npm prune --production

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port (Render overrides with $PORT dynamically)
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
