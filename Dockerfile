# Builder stage
FROM node:18.14-alpine AS builder

WORKDIR /indexer

# Copy package.json and yarn.lock files
COPY package*.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy other project files and build the project
COPY . .
RUN yarn build

# Runner stage
FROM node:18.14-alpine

WORKDIR /indexer

# Copy built files from builder stage
COPY --from=builder /indexer/dist ./

# Start the application
CMD [ "yarn", "start" ]
