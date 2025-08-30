@echo off
echo 🚀 Starting LSR Services...

echo 📡 Starting Main Server (Port 3002)...
cd /d "D:\stuffs\lsr-be"
start "LSR Main Server" npm start

echo 🔌 Starting Socket Microservice (Port 3003)...
cd /d "D:\stuffs\lsr-be\socket-microservice"
start "LSR Socket Service" npm start

echo ✅ Both services started!
echo.
echo 🌐 Main Server: http://localhost:3002
echo 🔌 Socket Service: http://localhost:3003
echo 📊 MongoDB: mongodb://localhost:27017
echo.
echo 📝 Services are running in separate windows
echo 🛑 Close the windows to stop the services
echo.
pause
