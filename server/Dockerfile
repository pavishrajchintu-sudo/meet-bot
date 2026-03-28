# Use the official Puppeteer image
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to fix permission issues during install
USER root

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies as root to avoid EACCES errors
RUN npm install

# Copy the rest of the code
COPY . .

# Change ownership of the app folder to pptruser
RUN chown -R pptruser:pptruser /app

# Switch back to the non-privileged user for security
USER pptruser

# Render's default port
EXPOSE 10000

CMD ["node", "server.js"]