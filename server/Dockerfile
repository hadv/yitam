FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./

# Install all dependencies including dev dependencies with legacy-peer-deps flag
RUN npm install --legacy-peer-deps

COPY . .

# Build the TypeScript project
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install all dependencies with legacy-peer-deps flag
RUN npm install --legacy-peer-deps

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

# Create directories for data persistence
RUN mkdir -p /app/data/knowledge

EXPOSE 3000

CMD ["npm", "start"] 