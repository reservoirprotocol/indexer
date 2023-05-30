FROM node:18.14

ARG PORT=80

EXPOSE ${PORT}

WORKDIR /indexer
ADD . /indexer
RUN yarn install
RUN yarn build
CMD yarn start
