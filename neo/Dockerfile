FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
