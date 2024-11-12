// build.js
import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildApp() {
  try {
    // Ensure dist directory exists
    await fs.ensureDir("dist");

    // Build the application
    await build({
      entryPoints: ["server.js"],
      bundle: true,
      platform: "node",
      target: "node18",
      outfile: "dist/server.js",
      format: "esm",
      external: [
        // Native modules that shouldn't be bundled
        "serialport",
        "robotjs",
        "modbus-serial",
        // Add other native modules if needed
      ],
      banner: {
        js: `
          import { createRequire } from 'module';
          import { fileURLToPath } from 'url';
          import { dirname } from 'path';
          const require = createRequire(import.meta.url);
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
        `,
      },
    });

    // Copy necessary files
    await fs.copy(".env", "dist/.env");
    await fs.copy("config", "dist/config");

    // Create startup script
    const startScript = `
@echo off
echo Starting Laser Backend Service...
"%~dp0laser-be.exe"
pause
    `.trim();

    await fs.writeFile("dist/start.bat", startScript);

    console.log("Build completed successfully!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

buildApp();
