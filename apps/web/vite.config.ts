import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "api-proxy",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith("/api/log-error")) {
            try {
              let bodyStr = "";
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const data = JSON.parse(bodyStr);
              console.error("\n\x1b[41m\x1b[37m\x1b[1m BROWSER AUTO-PROCESSOR ERROR \x1b[0m");
              console.error(`\x1b[31m\x1b[1mMessage:\x1b[0m \x1b[31m\x1b[1m${data.message}\x1b[0m`);
              
              if (data.stack) {
                const stackLines = data.stack.split("\n");
                let printedCrashSnippet = false;
                
                for (const rawLine of stackLines) {
                  const line = rawLine.trim();
                  // Match standard Chrome/Edge/Firefox stack lines
                  // Chrome/Edge format: at FunctionName (http://host/path:line:col) or at http://host/path:line:col
                  // Firefox format: FunctionName@http://host/path:line:col or @http://host/path:line:col
                  const chromeMatch = line.match(/(?:at\s+)?([^\s(]+)?\s*\(?(https?:\/\/[^\/]+(\/[^?#:\s)]+)(?:\?[^:\s)]+)?(?::(\d+))(?::(\d+)))\)?/i);
                  const firefoxMatch = !chromeMatch ? line.match(/([^@]+)?@?(https?:\/\/[^\/]+(\/[^?#:\s)]+)(?:\?[^:\s)]+)?(?::(\d+))(?::(\d+)))/i) : null;
                  
                  const match = chromeMatch || firefoxMatch;
                  if (match) {
                    const fnName = (match[1] || "anonymous").trim();
                    const fullUrl = match[2];
                    let urlPath = match[3];
                    const lineNum = parseInt(match[4], 10);
                    const colNum = parseInt(match[5], 10);
                    
                    let absPath = "";
                    if (urlPath.startsWith("/@fs/")) {
                      absPath = urlPath.substring(5);
                    } else {
                      // Try to resolve the web app relative URL to absolute workspace path
                      // __dirname is openreel-video/apps/web
                      const workspaceRoot = path.resolve(__dirname, "../../");
                      absPath = path.join(workspaceRoot, urlPath.replace(/^\//, ""));
                      if (!fs.existsSync(absPath)) {
                        absPath = path.resolve(__dirname, urlPath.replace(/^\//, ""));
                      }
                    }
                    
                    // Normalize Windows path formatting (e.g. /C:/... -> C:/...)
                    absPath = absPath.replace(/^\/([a-zA-Z]):/, "$1:").replace(/\//g, path.sep);
                    
                    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
                      if (!printedCrashSnippet) {
                        console.error(`\n\x1b[33m\x1b[1mCRASH POINT DETECTED AT:\x1b[0m \x1b[4m\x1b[36m${absPath}:${lineNum}:${colNum}\x1b[0m \x1b[2m(in ${fnName})\x1b[0m`);
                        try {
                          const fileContent = fs.readFileSync(absPath, "utf8");
                          const fileLines = fileContent.split(/\r?\n/);
                          const startLine = Math.max(0, lineNum - 4);
                          const endLine = Math.min(fileLines.length, lineNum + 3);
                          
                          console.error("\x1b[90m--------------------------------------------------------------------------------\x1b[0m");
                          for (let i = startLine; i < endLine; i++) {
                            const isCrashLine = i === lineNum - 1;
                            const lineNoStr = String(i + 1).padStart(5, " ");
                            if (isCrashLine) {
                              console.error(`\x1b[31m\x1b[1m=> ${lineNoStr} | ${fileLines[i] || ""}\x1b[0m`);
                            } else {
                              console.error(`\x1b[90m   ${lineNoStr} | ${fileLines[i] || ""}\x1b[0m`);
                            }
                          }
                          console.error("\x1b[90m--------------------------------------------------------------------------------\x1b[0m");
                        } catch (readErr) {
                          console.error(`\x1b[90m[Could not read source file for snippet: ${(readErr as Error).message}]\x1b[0m`);
                        }
                        printedCrashSnippet = true;
                      }
                      console.error(`    at ${fnName} (${absPath}:${lineNum}:${colNum})`);
                    } else {
                      console.error(`    at ${fnName} (${fullUrl})`);
                    }
                  } else {
                    console.error("  " + rawLine);
                  }
                }
              } else {
                console.error("[No stack trace provided]");
              }
              console.error("\x1b[41m\x1b[37m\x1b[1m=========================================================================\x1b[0m\n");
              
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
              return;
            } catch (err) {
              console.error("[Vite Log-Error Middleware Error]", err);
              res.statusCode = 500;
              res.end();
              return;
            }
          }
          if (req.url && req.url.startsWith("/api/proxy/")) {
            try {
              const urlPath = req.url.replace(/^\/api\/proxy\//, "");
              const parts = urlPath.split("?");
              const pathParts = parts[0].split("/");
              const service = pathParts[0];
              const remainingPath = pathParts.slice(1).join("/");

              const SERVICE_CONFIGS: Record<string, { baseUrl: string; authHeaders: (key: string) => Record<string, string> }> = {
                elevenlabs: {
                  baseUrl: "https://api.elevenlabs.io/v1",
                  authHeaders: (key) => ({ "xi-api-key": key }),
                },
                openai: {
                  baseUrl: "https://api.openai.com/v1",
                  authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
                },
                anthropic: {
                  baseUrl: "https://api.anthropic.com/v1",
                  authHeaders: (key) => ({
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                  }),
                },
              };

              const config = SERVICE_CONFIGS[service];
              if (!config) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Unknown service: ${service}` }));
                return;
              }

              const apiKey = (req.headers["x-proxy-api-key"] as string) || "";
              const customBaseUrl = (req.headers["x-proxy-base-url"] as string) || "";

              if (!apiKey) {
                console.warn("[Vite Proxy] Rejecting request: Missing x-proxy-api-key header");
                res.statusCode = 401;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Missing x-proxy-api-key header" }));
                return;
              }

              const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/$/, "") : config.baseUrl;
              const search = parts[1] ? `?${parts[1]}` : "";
              
              // Tránh nhân đôi đường dẫn dịch vụ nếu người dùng điền full URL ở settings
              const targetUrl = remainingPath
                ? (baseUrl.endsWith(remainingPath) ? `${baseUrl}${search}` : `${baseUrl}/${remainingPath}${search}`)
                : `${baseUrl}${search}`;

              let body: Buffer | undefined = undefined;
              if (req.method !== "GET" && req.method !== "HEAD") {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(chunk as Buffer);
                }
                body = Buffer.concat(chunks);
              }

               const upstreamHeaders: Record<string, string> = {
                "Content-Type": (req.headers["content-type"] as string) || "application/json",
              };

              const isMimo = baseUrl.includes("xiaomimimo.com") || baseUrl.includes("mimo");
              if (isMimo) {
                upstreamHeaders["api-key"] = apiKey;
                upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
              } else {
                for (const [k, v] of Object.entries(config.authHeaders(apiKey))) {
                  upstreamHeaders[k] = v;
                }
              }

              console.log("[Vite Proxy Debug Input]", {
                method: req.method,
                service,
                remainingPath,
                customBaseUrl,
                baseUrl,
                targetUrl,
                isMimo,
                apiKeyLength: apiKey.length,
                apiKeyPreview: apiKey ? `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}` : "NONE",
                sentHeaderKeys: Object.keys(upstreamHeaders),
              });

              const response = await fetch(targetUrl, {
                method: req.method,
                headers: upstreamHeaders,
                body: body,
              });

              console.log("[Vite Proxy Debug Output]", {
                status: response.status,
                statusText: response.statusText,
              });

              res.statusCode = response.status;
              res.statusMessage = response.statusText;

              response.headers.forEach((value, name) => {
                if (name !== "content-encoding" && name !== "transfer-encoding") {
                  res.setHeader(name, value);
                }
              });

              const arrayBuffer = await response.arrayBuffer();
              const responseBuffer = Buffer.from(arrayBuffer);

              if (response.status !== 200 && response.status !== 201) {
                try {
                  const responseText = responseBuffer.toString("utf8");
                  console.error("[Vite Proxy Upstream Error Body]", responseText);
                } catch (e) {
                  console.error("[Vite Proxy Upstream Error] Could not read error body as text");
                }
              }

              res.write(responseBuffer);
              res.end();
            } catch (error) {
              console.error("[Vite Proxy Error]", error);
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Failed to reach upstream service via local proxy" }));
            }
          } else {
            next();
          }
        });
      }
    }
  ],
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@openreel/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@ffmpeg/core", "@ffmpeg/core-mt"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/zustand")) {
            return "zustand";
          }
          if (id.includes("node_modules/three")) {
            return "three";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "radix";
          }
        },
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
