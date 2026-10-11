const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.js/,
  timeout: 90000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "node serve.js",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
