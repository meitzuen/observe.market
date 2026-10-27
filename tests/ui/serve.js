const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../docs");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(root, p));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      // Production reads data from R2; tests read the local docs/data fixtures.
      if (file === path.join(root, "assets", "data.js")) {
        buf = Buffer.from(
          buf.toString().replace(/const DATA_BASE = "[^"]*";/, 'const DATA_BASE = "data/";'),
        );
      }
      res
        .writeHead(200, {
          "content-type": types[path.extname(file)] || "application/octet-stream",
        })
        .end(buf);
    });
  })
  .listen(4173, "127.0.0.1", () => console.log("serving", root));
