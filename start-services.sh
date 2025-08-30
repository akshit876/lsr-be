#!/bin/bash

# LSR Services Startup Script
# This script starts both the main server and socket microservice

echo "🚀 Starting LSR Services..."

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ Port $1 is already in use!"
        return 1
    fi
    return 0
}

# Check if ports are available
echo "🔍 Checking port availability..."
if ! check_port 3002; then
    echo "Please stop the service using port 3002 first"
    exit 1
fi

if ! check_port 3003; then
    echo "Please stop the service using port 3003 first"
    exit 1
fi

# Start main server in background
echo "📡 Starting Main Server (Port 3002)..."
cd /d/stuffs/lsr-be
npm start &
MAIN_SERVER_PID=$!

# Wait a bit for main server to start
sleep 3

# Start socket microservice in background
echo "🔌 Starting Socket Microservice (Port 3003)..."
cd /d/stuffs/lsr-be/socket-microservice
npm start &
SOCKET_SERVICE_PID=$!

# Wait a bit for socket service to start
sleep 3

echo "✅ Both services started!"
echo "📊 Main Server PID: $MAIN_SERVER_PID"
echo "📊 Socket Service PID: $SOCKET_SERVICE_PID"
echo ""
echo "🌐 Main Server: http://localhost:3002"
echo "🔌 Socket Service: http://localhost:3003"
echo "📊 MongoDB: mongodb://localhost:27017"
echo ""
echo "📝 To stop services:"
echo "   kill $MAIN_SERVER_PID $SOCKET_SERVICE_PID"
echo ""
echo "📝 To view logs:"
echo "   tail -f logs/combined.log"
echo "   tail -f socket-microservice/logs/socket-service.log"
echo ""
echo "🔍 Health checks:"
echo "   curl http://localhost:3002/health"
echo "   curl http://localhost:3003/health"

# Wait for user to stop
echo ""
echo "Press Ctrl+C to stop all services..."
trap "echo '🛑 Stopping services...'; kill $MAIN_SERVER_PID $SOCKET_SERVICE_PID 2>/dev/null; exit" INT

# Keep script running
wait
