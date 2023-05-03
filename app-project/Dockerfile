FROM node:15-alpine3.13

ARG TAG_VERSION

WORKDIR /usr/src/app

RUN mkdir -p /usr/src/app

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN cp -a /tmp/node_modules /usr/src/app

COPY server.js /usr/src/app/
RUN sed -i "s/TAG_VERSION/${TAG_VERSION}/g" /usr/src/app/server.js && \
    npm install

EXPOSE 8081

CMD ["node", "server.js"]
