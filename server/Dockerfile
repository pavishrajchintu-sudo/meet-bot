FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# FORCE CHROME INSTALLATION into the pptruser cache directory
RUN npx puppeteer browsers install chrome

# Copy source code
COPY . .

# Ensure pptruser owns everything
RUN chown -R pptruser:pptruser /app /home/pptruser/.cache/puppeteer

USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]