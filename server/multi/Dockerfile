# kesennuma-multi — in-memory WebSocket rooms. Nothing is written to disk.
# Build from this directory: docker build -t kesennuma-multi server/multi
FROM oven/bun:1.3.14
WORKDIR /app
COPY wire.js origin.js rooms.js index.js ./
ENV PORT=8080
EXPOSE 8080
USER bun
CMD ["bun", "index.js"]
