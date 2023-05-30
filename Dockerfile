FROM node:18.14

ARG PORT=80

EXPOSE ${PORT}

WORKDIR /indexer
ADD package.json yarn.lock /indexer/
RUN yarn install
ADD . /indexer
RUN yarn build
CMD yarn start
