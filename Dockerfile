FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# 의존성 먼저 설치 (코드만 바뀌면 이 레이어는 캐시 재사용)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3000
CMD ["node", "index.js"]
