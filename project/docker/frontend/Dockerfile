FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY frontend/ ./

ARG VITE_API_URL=/v1
ARG VITE_DEV_MODE=false
ENV VITE_API_URL=$VITE_API_URL \
    VITE_DEV_MODE=$VITE_DEV_MODE

RUN yarn build

FROM nginx:1.27-alpine

COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
