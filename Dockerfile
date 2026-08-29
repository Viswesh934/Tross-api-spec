FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy package management files
COPY package*.json ./

# Install exact dependencies
RUN npm install

# Ensure Playwright Chromium binary is installed and matched
RUN npx playwright install chromium

# Copy TypeScript configuration and source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist/
RUN npm run build

# Remove devDependencies to keep final image clean and lightweight
RUN npm prune --production

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port (Render overrides with $PORT dynamically)
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
