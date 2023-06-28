FROM node:18.14

ARG PORT=80

# EXPOSE ${PORT}
RUN npm install -g bun
WORKDIR /indexer
ADD ./packages/indexer /indexer
RUN yarn install
RUN bun run build
CMD bun start
