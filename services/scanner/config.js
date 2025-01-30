export const SCANNER_CONFIG = {
  RESET: {
    BIT_ADDRESS: 1600,
    BIT: 0,
    CHECK_INTERVAL: 100,
  },
  MODBUS: {
    TIMEOUT: 5000,
    RETRY_COUNT: 3,
  },
  MONGODB: {
    DATABASE: "main-data",
    COLLECTIONS: {
      RECORDS: "records",
      CONFIG: "config",
    },
  },
  TCP: {
    PORT: 5024,
    HOST: "192.168.3.147",
  },
};
