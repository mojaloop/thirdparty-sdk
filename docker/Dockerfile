FROM node:12.16.1-alpine as builder
USER root
WORKDIR /opt/thirdparty-scheme-adapter

RUN apk add --no-cache -t build-dependencies git make gcc g++ python libtool autoconf automake \
    && cd $(npm root -g)/npm \
    && npm config set unsafe-perm true \
    && npm install -g node-gyp 

COPY package.json package-lock.json* /opt/thirdparty-scheme-adapter/
RUN npm ci
RUN npm prune --production

COPY . /opt/thirdparty-scheme-adapter

FROM node:12.16.1-alpine
WORKDIR /opt/thirdparty-scheme-adapter

# Create empty log file & link stdout to the application log file
RUN mkdir ./logs && touch ./logs/combined.log
RUN ln -sf /dev/stdout ./logs/combined.log

# Create a non-root user: thirdparty-scheme-adapter-user 
RUN adduser -D thirdparty-scheme-adapter-user 
USER thirdparty-scheme-adapter-user 
COPY --chown=thirdparty-scheme-adapter-user --from=builder /opt/thirdparty-scheme-adapter .

EXPOSE 4005 4006