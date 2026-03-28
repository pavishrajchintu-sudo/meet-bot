const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // This tells Puppeteer to store the browser in a folder called .cache 
  // inside your project so it stays persistent on Render.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};