# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation

# --- Build stage: compile whisper.cpp ---
FROM node:22-slim AS whisper-build
RUN apt-get update && apt-get install -y build-essential git cmake \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git /tmp/whisper.cpp \
    && cd /tmp/whisper.cpp && cmake -B build -DBUILD_SHARED_LIBS=OFF && cmake --build build -j$(nproc) --config Release

# --- Main image ---
FROM node:22-slim

# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    curl \
    git \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Python3 + ffmpeg + gdown + Google API client
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages gdown google-api-python-client google-auth

# Copy whisper.cpp binary from build stage
COPY --from=whisper-build /tmp/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

# Install GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code

# Install pdf-reader skill
COPY skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader
RUN chmod +x /usr/local/bin/pdf-reader

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint script
# Container input (prompt, group info) is passed via stdin JSON.
# Credentials are injected by the host's credential proxy — never passed here.
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN printf '#!/bin/bash\nset -e\n# Configure git + gh credentials from GITHUB_TOKEN if provided\nif [ -n "$GITHUB_TOKEN" ]; then\n  git config --global credential.helper store\n  printf "https://x-access-token:%s@github.com\\n" "$GITHUB_TOKEN" > ~/.git-credentials\n  git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"\nfi\ncd /app && npx tsc --outDir /tmp/dist 2>&1 >&2\nln -s /app/node_modules /tmp/dist/node_modules\nchmod -R a-w /tmp/dist\ncat > /tmp/input.json\nnode /tmp/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
