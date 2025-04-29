FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install

COPY . .

# Build the TypeScript project
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install all dependencies (including @qdrant/js-client-rest)
RUN npm install

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

# Create directories for data persistence
RUN mkdir -p /app/data/knowledge

EXPOSE 3000

CMD ["npm", "start"] 