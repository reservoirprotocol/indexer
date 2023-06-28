FROM node:18.14

ARG PORT=80

EXPOSE ${PORT}
RUN npm install -g bun
WORKDIR /indexer
ADD . /indexer
RUN bun install
RUN cd /packages/indexer && bun install
RUN bun build
CMD bun start
