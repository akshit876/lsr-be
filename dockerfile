# Stage 1: Build the application
FROM node:18 AS build

# Set the working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Build the executable with pkg
RUN npm run build

# Stage 2: Run the application
FROM node:18 AS production

# Set the working directory
WORKDIR /app

# Copy the executable from the previous stage
COPY --from=build /app/dist/laser-be.exe /app/laser-be.exe

# Copy additional files required at runtime
COPY --from=build /app/.env /app/.env
COPY --from=build /app/node_modules /app/node_modules

# Expose the port if the app uses one
EXPOSE 3000

# Define the default command to run the executable
# CMD ["./laser-be.exe"]
