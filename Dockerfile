FROM node:22-alpine

# Install system dependencies including Chromium
RUN apk add --no-cache \
    chromium \
    noto-noto-sans \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-dejavu \
    libxss1

# Set environment for Puppeteer to use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install dependencies without running postinstall that tries to download chromium
RUN npm install -g pnpm && pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# Build Next.js app
RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start"]
