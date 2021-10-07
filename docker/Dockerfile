FROM node:14.15-alpine as builder
USER root
WORKDIR /opt/thirdparty-sdk

RUN apk update \
    && apk add --no-cache -t build-dependencies git make gcc g++ python libtool autoconf automake openssh \
    && cd $(npm root -g)/npm \
    && npm config set unsafe-perm true \
    && npm install -g node-gyp 

COPY package.json package-lock.json* /opt/thirdparty-sdk/
RUN npm ci
RUN npm prune --production

COPY . /opt/thirdparty-sdk

FROM node:14.15-alpine
WORKDIR /opt/thirdparty-sdk

# Create empty log file & link stdout to the application log file
RUN mkdir ./logs && touch ./logs/combined.log
RUN ln -sf /dev/stdout ./logs/combined.log

# Create a non-root user: thirdparty-sdk-user 
RUN adduser -D thirdparty-sdk-user 
USER thirdparty-sdk-user 
COPY --chown=thirdparty-sdk-user --from=builder /opt/thirdparty-sdk .

EXPOSE 4005 4006