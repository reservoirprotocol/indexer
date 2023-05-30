FROM node:18.14

ARG PORT=80

EXPOSE ${PORT}

WORKDIR /indexer
COPY package.json /indexer
COPY yarn.lock /indexer
RUN yarn install
ADD . /indexer
RUN yarn build
CMD yarn start
