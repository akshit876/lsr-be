import { logger } from "../utils/logger.js";

export class HealthService {
  constructor(modbusService) {
    this.modbusService = modbusService;
    this.isInitialized = false;
    this.healthStatus = {
      overall: "unknown",
      services: {},
      lastCheck: null,
      uptime: 0,
    };
  }

  async initialize() {
    try {
      logger.info("🚀 Initializing Health Service...");

      // Set up periodic health checks
      this.setupPeriodicHealthChecks();

      this.isInitialized = true;
      logger.success("✅ Health Service initialized successfully");
    } catch (error) {
      logger.error("❌ Health Service initialization failed:", error);
      throw error;
    }
  }

  setupPeriodicHealthChecks() {
    try {
      // Run health check every 30 seconds
      setInterval(async () => {
        try {
          await this.runHealthCheck();
        } catch (error) {
          logger.error("❌ Periodic health check failed:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
          });
        }
      }, 30000);
    } catch (error) {
      logger.error("❌ Failed to setup periodic health checks:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
  }

  async runHealthCheck() {
    try {
      logger.debug("🔍 Running health check...");

      const startTime = Date.now();

      // Check Modbus service health
      const modbusHealth = await this.modbusService.healthCheck();

      // Check service statuses
      const servicesHealth = {
        modbus: modbusHealth,
        socketEvent: { status: "healthy", message: "Service running" },
        eventEmitter: { status: "healthy", message: "Service running" },
      };

      // Determine overall health
      const overallHealth = this.determineOverallHealth(servicesHealth);

      // Update health status
      this.healthStatus = {
        overall: overallHealth,
        services: servicesHealth,
        lastCheck: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: Date.now() - startTime,
      };

      logger.debug(`✅ Health check completed: ${overallHealth}`);

      return this.healthStatus;
    } catch (error) {
      logger.error("❌ Health check failed:", error);

      this.healthStatus = {
        overall: "unhealthy",
        services: {
          health: { status: "unhealthy", message: error.message },
        },
        lastCheck: new Date().toISOString(),
        uptime: process.uptime(),
        error: error.message,
      };

      return this.healthStatus;
    }
  }

  determineOverallHealth(servicesHealth) {
    const statuses = Object.values(servicesHealth).map(
      (service) => service.status
    );

    if (statuses.every((status) => status === "healthy")) {
      return "healthy";
    } else if (statuses.some((status) => status === "unhealthy")) {
      return "unhealthy";
    } else {
      return "degraded";
    }
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return {
          status: "unhealthy",
          message: "Health Service not initialized",
        };
      }

      // Return cached health status if recent
      if (this.healthStatus.lastCheck) {
        const lastCheckTime = new Date(this.healthStatus.lastCheck);
        const timeSinceLastCheck = Date.now() - lastCheckTime.getTime();

        // If last check was less than 1 minute ago, return cached result
        if (timeSinceLastCheck < 60000) {
          return {
            status: this.healthStatus.overall,
            message: "Health check completed recently",
            details: this.healthStatus,
          };
        }
      }

      // Run fresh health check
      return await this.runHealthCheck();
    } catch (error) {
      return { status: "unhealthy", message: error.message };
    }
  }

  getDetailedHealth() {
    return this.healthStatus;
  }

  getServiceHealth(serviceName) {
    return (
      this.healthStatus.services[serviceName] || {
        status: "unknown",
        message: "Service not found",
      }
    );
  }

  async shutdown() {
    try {
      logger.info("🔄 Shutting down Health Service...");
      this.isInitialized = false;
      logger.info("✅ Health Service shutdown complete");
    } catch (error) {
      logger.warn("⚠️ Error during Health Service shutdown:", error.message);
    }
  }
}
