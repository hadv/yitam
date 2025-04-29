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

# Install only production dependencies
RUN npm install --production

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["npm", "start"] 