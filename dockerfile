# Use the official Node.js 18 image as the base
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port if the app uses one
EXPOSE 3000

# Define the default command to start the server
CMD ["npm", "start"]
