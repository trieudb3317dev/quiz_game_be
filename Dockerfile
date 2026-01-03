# Build stage
FROM node:22 AS builder

# Thư mục làm việc trong container
WORKDIR /app

# Copy package files trước để cache layer
COPY package*.json ./

# Cài đặt dependencies bằng npm
RUN npm install --force

# Copy toàn bộ source vào container
COPY . .

# Build NestJS project
RUN npm run build

# Port mà app sẽ chạy (NestJS mặc định là 8080)
EXPOSE 8080

# Lệnh khởi động app ở chế độ production
CMD ["npm", "run", "start:prod"]