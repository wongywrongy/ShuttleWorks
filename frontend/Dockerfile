# Frontend Dockerfile — multi-stage production build.
#
# Stage 1: build the React app with node:20-alpine.
# Stage 2: serve the compiled assets with the nginx-unprivileged image,
# which runs as UID 101 by default and listens on port 8080 (non-root
# can't bind to <1024). Compose remaps 80:8080 so users still hit
# http://localhost.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build argument for API URL (baked into static files)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build


# Stage 2 — serve with the non-root nginx image.
FROM nginxinc/nginx-unprivileged:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# nginx-unprivileged already owns /usr/share/nginx/html as UID 101.
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
