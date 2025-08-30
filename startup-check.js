import { connect, readRegister } from "./services/modbus.js";
import logger from "./logger.js";

class StartupChecker {
  constructor() {
    this.checks = [];
    this.results = [];
  }

  async runChecks() {
    logger.section("🔍 Running Startup Checks");

    this.checks = [
      {
        name: "Modbus Connection Test",
        check: this.checkModbusConnection.bind(this),
        critical: true,
      },
      {
        name: "MongoDB Connection Test",
        check: this.checkMongoConnection.bind(this),
        critical: true,
      },
      {
        name: "Port Availability Test",
        check: this.checkPortAvailability.bind(this),
        critical: true,
      },
      {
        name: "Service Dependencies Test",
        check: this.checkServiceDependencies.bind(this),
        critical: false,
      },
    ];

    for (const check of this.checks) {
      try {
        logger.info(`🧪 Running: ${check.name}`);
        const result = await check.check();
        this.results.push({ name: check.name, success: true, result });
        logger.success(`✅ ${check.name}: PASSED`);
      } catch (error) {
        this.results.push({
          name: check.name,
          success: false,
          error: error.message,
        });
        logger.error(`❌ ${check.name}: FAILED - ${error.message}`);

        if (check.critical) {
          logger.error(`🚨 Critical check failed: ${check.name}`);
          return false;
        }
      }
    }

    this.printResults();
    return this.results.every((r) => r.success || !r.critical);
  }

  async checkModbusConnection() {
    try {
      logger.info("  🔌 Testing Modbus connection...");
      await connect();
      logger.info("  ✅ Modbus connection successful");

      // Try to read a register to verify communication
      logger.info("  📖 Testing Modbus communication...");
      await readRegister(1, 1);
      logger.info("  ✅ Modbus communication successful");

      return { status: "connected", communication: "working" };
    } catch (error) {
      throw new Error(`Modbus connection failed: ${error.message}`);
    }
  }

  async checkMongoConnection() {
    try {
      logger.info("  🗄️ Testing MongoDB connection...");
      const { MongoClient } = await import("mongodb");
      const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
      const client = new MongoClient(uri);

      await client.connect();
      const db = client.db("main-data");
      await db.admin().ping();
      await client.close();

      logger.info("  ✅ MongoDB connection successful");
      return { status: "connected", database: "main-data" };
    } catch (error) {
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }

  async checkPortAvailability() {
    try {
      logger.info("  🌐 Testing port availability...");
      const PORT = process.env.PORT || 3002;

      // Try to create a server on the port
      const { createServer } = await import("http");
      const server = createServer();

      return new Promise((resolve, reject) => {
        server.listen(PORT, () => {
          server.close(() => {
            logger.info(`  ✅ Port ${PORT} is available`);
            resolve({ port: PORT, status: "available" });
          });
        });

        server.on("error", (error) => {
          if (error.code === "EADDRINUSE") {
            reject(new Error(`Port ${PORT} is already in use`));
          } else {
            reject(new Error(`Port error: ${error.message}`));
          }
        });
      });
    } catch (error) {
      throw new Error(`Port check failed: ${error.message}`);
    }
  }

  async checkServiceDependencies() {
    try {
      logger.info("  📦 Checking service dependencies...");

      // Check if required modules can be imported
      const modules = [
        "./services/socketEventService.js",
        "./services/scanCycles.js",
        "./services/cronService.js",
        "./services/mongoDbService.js",
      ];

      for (const module of modules) {
        try {
          await import(module);
          logger.info(`    ✅ ${module} - OK`);
        } catch (error) {
          logger.warn(`    ⚠️ ${module} - Import failed: ${error.message}`);
        }
      }

      return { status: "dependencies_checked" };
    } catch (error) {
      throw new Error(`Dependency check failed: ${error.message}`);
    }
  }

  printResults() {
    logger.section("📊 Startup Check Results");

    const totalChecks = this.results.length;
    const passedChecks = this.results.filter((r) => r.success).length;
    const failedChecks = totalChecks - passedChecks;
    const criticalFailures = this.results.filter(
      (r) => !r.success && r.critical
    ).length;

    logger.info(`Total Checks: ${totalChecks}`);
    logger.info(`Passed: ${passedChecks}`);
    logger.info(`Failed: ${failedChecks}`);
    logger.info(`Critical Failures: ${criticalFailures}`);

    if (failedChecks > 0) {
      logger.warn("Failed Checks:");
      this.results
        .filter((r) => !r.success)
        .forEach((result) => {
          const critical = result.critical ? "🚨 CRITICAL" : "⚠️ WARNING";
          logger.warn(`  ${critical} ${result.name}: ${result.error}`);
        });
    }

    if (criticalFailures > 0) {
      logger.error(
        "🚨 Critical failures detected! Server may not start properly."
      );
    } else if (failedChecks === 0) {
      logger.success("🎉 All checks passed! Server should start successfully.");
    } else {
      logger.warn(
        "⚠️ Some non-critical checks failed, but server should start."
      );
    }
  }
}

// Main execution
async function main() {
  const checker = new StartupChecker();

  try {
    const success = await checker.runChecks();

    if (success) {
      logger.info("🚀 Startup checks completed successfully");
      process.exit(0);
    } else {
      logger.error("❌ Startup checks failed");
      process.exit(1);
    }
  } catch (error) {
    logger.error("💥 Startup check execution failed:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}

export default StartupChecker;
