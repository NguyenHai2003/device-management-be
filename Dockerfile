FROM node:20-alpine

WORKDIR /app

# Copy package info and install
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Assume backend listens on 5000 based on package.json/env
EXPOSE 5000

CMD ["npm", "start"]
