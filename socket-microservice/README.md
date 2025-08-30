# LSR Socket Microservice

A dedicated Socket.IO microservice for handling real-time PLC control events in the LSR (Laser Serial Reader) system.

## 🏗️ Architecture

This microservice is designed to be completely independent from the main LSR backend, providing:

- **Real-time PLC control** via Socket.IO
- **Modbus communication** for industrial automation
- **Scalable architecture** that can be deployed independently
- **Clear separation of concerns** from the main application

## 🚀 Features

- **Socket.IO Server** - Real-time bidirectional communication
- **Modbus Service** - PLC communication with automatic reconnection
- **Event Handling** - Scanner trigger, mark on, light on, servo settings
- **Health Monitoring** - Service health checks and status monitoring
- **Logging** - Structured logging with Winston
- **Configuration** - Environment-based configuration management
- **Docker Support** - Containerized deployment
- **Error Handling** - Comprehensive error handling and recovery

## 📋 Prerequisites

- Node.js 18+
- npm 8+
- Access to PLC via Modbus TCP
- Docker (optional, for containerized deployment)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/lsr-socket-microservice.git
cd lsr-socket-microservice
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
# Copy environment template
cp env.example .env

# Edit environment variables
nano .env
```

Required environment variables:

```bash
# Modbus Configuration
# Use either NEXT_PUBLIC_* (for Next.js compatibility) or MODBUS_*
NEXT_PUBLIC_MODBUS_IP=192.168.3.146  # Your PLC IP address
NEXT_PUBLIC_MODBUS_PORT=502           # Modbus port (usually 502)
MODBUS_IP=192.168.3.146              # Alternative environment variable
MODBUS_PORT=502                       # Alternative environment variable

# Service Configuration
SOCKET_SERVICE_PORT=3003  # Service port
FRONTEND_URL=http://localhost:3000  # Frontend URL for CORS
```

## 🚀 Running the Service

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f socket-service

# Stop services
docker-compose down
```

## 📡 Available Socket Events

### Client → Server Events

| Event                      | Description                | Payload                                                              |
| -------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `scanner_trigger`          | Trigger scanner operation  | None                                                                 |
| `mark_on`                  | Activate marking system    | None                                                                 |
| `light_on`                 | Turn on indicator light    | None                                                                 |
| `manual-run`               | Execute manual operation   | `{ operation: string }`                                              |
| `servo-setting-change`     | Update servo parameters    | `{ setting: string, value: object }`                                 |
| `job-control`              | Control job operations     | `{ jobType: string, action: string }`                                |
| `plc-bit-operation`        | Generic bit operation      | `{ address: number, bit: number, value: number, operation: string }` |
| `plc-register-operation`   | Generic register operation | `{ address: number, value: number, operation: string }`              |
| `get-event-service-status` | Get service status         | None                                                                 |
| `health-check`             | Perform health check       | None                                                                 |

### Server → Client Events

| Event                           | Description                | Payload                                                    |
| ------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `scanner_trigger_success`       | Scanner operation success  | `{ timestamp, register, bit, value }`                      |
| `mark_on_success`               | Mark operation success     | `{ timestamp, register, bit, value }`                      |
| `light_on_success`              | Light operation success    | `{ timestamp, register, bit, value }`                      |
| `manualRunSuccess`              | Manual operation success   | `{ operation, result, timestamp }`                         |
| `servo-setting-change-response` | Servo setting response     | `{ success: boolean, setting: string }`                    |
| `jobControlSuccess`             | Job control success        | `{ jobType, action, timestamp, message }`                  |
| `plcBitOperationSuccess`        | Bit operation success      | `{ operation, address, bit, value, timestamp }`            |
| `plcRegisterOperationSuccess`   | Register operation success | `{ operation, address, value, timestamp }`                 |
| `event-service-status`          | Service status             | `{ isInitialized, eventCounts, timestamp, serviceHealth }` |
| `health-check-response`         | Health check result        | `{ status: string, message: string }`                      |
| `error`                         | Error response             | `{ type: string, message: string, timestamp }`             |

## 🔌 PLC Register Mapping

### Scanner Control

- **Scanner Trigger**: Register 1481, Bit 0
- **Mark On**: Register 1480, Bit 0
- **Light On**: Register 1482, Bit 0

### Servo Settings

- **Home Position**: Register 550 (position), 560 (speed)
- **Scanner Position**: Register 552 (position), 562 (speed)
- **OCR Position**: Register 554 (position), 564 (speed)
- **Mark Position**: Register 556 (position), 566 (speed)
- **Forward End Limit**: Register 574
- **Reverse End Limit**: Register 578

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Socket Events

```bash
# Install socket.io-client for testing
npm install socket.io-client

# Run test script
node tests/socket-test.js
```

## 📊 Monitoring & Health Checks

### Health Endpoint

```bash
curl http://localhost:3003/health
```

### Service Status

```bash
# Via Socket.IO
socket.emit('get-event-service-status');
```

### Logs

```bash
# View logs
tail -f logs/socket-service.log

# Docker logs
docker-compose logs -f socket-service
```

## 🔧 Configuration

### Environment Variables

| Variable                  | Default                 | Description               |
| ------------------------- | ----------------------- | ------------------------- |
| `NODE_ENV`                | `development`           | Environment mode          |
| `SOCKET_SERVICE_PORT`     | `3003`                  | Service port              |
| `NEXT_PUBLIC_MODBUS_IP`   | `192.168.3.146`         | PLC IP address (Next.js)  |
| `NEXT_PUBLIC_MODBUS_PORT` | `502`                   | Modbus port (Next.js)     |
| `MODBUS_IP`               | `192.168.3.146`         | PLC IP address (alt)      |
| `MODBUS_PORT`             | `502`                   | Modbus port (alt)         |
| `MODBUS_TIMEOUT`          | `5000`                  | Connection timeout (ms)   |
| `MODBUS_RETRIES`          | `3`                     | Max reconnection attempts |
| `FRONTEND_URL`            | `http://localhost:3000` | Frontend URL for CORS     |
| `LOG_LEVEL`               | `info`                  | Logging level             |
| `HELMET_ENABLED`          | `true`                  | Security headers          |

### PLC Configuration

Modify `src/config/index.js` to adjust PLC register mappings:

```javascript
plc: {
  registers: {
    scannerTrigger: { address: 1481, bit: 0 },
    markOn: { address: 1480, bit: 0 },
    // ... more configurations
  }
}
```

## 🐳 Docker

### Build Image

```bash
docker build -t lsr-socket-service .
```

### Run Container

```bash
docker run -p 3003:3003 \
  -e NEXT_PUBLIC_MODBUS_IP=192.168.3.146 \
  -e NEXT_PUBLIC_MODBUS_PORT=502 \
  lsr-socket-service
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📁 Project Structure

```
socket-microservice/
├── src/
│   ├── config/          # Configuration management
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   └── index.js         # Main entry point
├── tests/               # Test files
├── logs/                # Log files
├── docker-compose.yml   # Docker Compose configuration
├── Dockerfile           # Docker image definition
├── package.json         # Dependencies and scripts
└── README.md            # This file
```

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**

   ```bash
   export NODE_ENV=production
   export MODBUS_IP=your-plc-ip
   export MODBUS_PORT=502
   ```

2. **Start Service**
   ```bash
   npm start
   ```

### PM2 Process Manager

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start src/index.js --name "lsr-socket-service"

# Monitor
pm2 monit

# View logs
pm2 logs lsr-socket-service
```

### Kubernetes Deployment

```bash
# Apply deployment
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=lsr-socket-service
```

## 🔍 Troubleshooting

### Common Issues

1. **Modbus Connection Failed**

   - Check PLC IP and port
   - Verify network connectivity
   - Check firewall settings

2. **Socket Connection Issues**

   - Verify CORS configuration
   - Check frontend URL
   - Monitor service logs

3. **Service Startup Issues**
   - Check environment variables
   - Verify port availability
   - Check dependencies

### Debug Commands

```bash
# Check service status
curl http://localhost:3003/health

# View service logs
tail -f logs/socket-service.log

# Check port usage
netstat -tulpn | grep :3003

# Test Modbus connection
node tests/modbus-test.js
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/lsr-socket-microservice/issues)
- **Documentation**: [Wiki](https://github.com/your-org/lsr-socket-microservice/wiki)
- **Email**: support@your-org.com

## 🔗 Related Projects

- **LSR Main Backend**: [lsr-backend](https://github.com/your-org/lsr-backend)
- **LSR Frontend**: [lsr-frontend](https://github.com/your-org/lsr-frontend)
- **LSR Documentation**: [lsr-docs](https://github.com/your-org/lsr-docs)
