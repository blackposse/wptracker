FROM node:20-alpine AS builder
WORKDIR /app

# Bootstrap a Vite + React project
RUN npm create vite@latest . -- --template react --yes 2>/dev/null || true
COPY src/ ./src/

RUN npm install && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
