FROM node:18.14-alpine

ARG PORT=80

EXPOSE ${PORT}
RUN apk add --no-cache git

WORKDIR /indexer
ADD . /indexer
RUN yarn install
RUN yarn build
CMD yarn start
