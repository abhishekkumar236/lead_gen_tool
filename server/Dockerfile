FROM node:22-alpine

WORKDIR /app

# Deps first so edits to src/ don't invalidate the install layer.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

EXPOSE 4100

CMD ["npm", "start"]
