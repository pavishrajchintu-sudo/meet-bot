# Use a Node image that comes with Puppeteer dependencies pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the server code
COPY . .

# Expose the port Render expects
EXPOSE 10000

# Start the server
CMD ["node", "server.js"]