FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to configure the environment
USER root

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# CRITICAL: Grant permission to the Puppeteer cache where Chrome lives
RUN chown -R pptruser:pptruser /app && chmod -R 777 /home/pptruser/.cache/puppeteer

# Switch back to the specialized user
USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]