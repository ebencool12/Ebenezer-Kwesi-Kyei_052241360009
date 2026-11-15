#!/usr/bin/env bash

# FD ABRANTE3 SPOT 2 - Start Script
PORT="${PORT:-4173}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.server.pid"
LOG_FILE="$DIR/.server.log"

cd "$DIR" || exit 1

# Check if already running via PID file
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null)
  if kill -0 "$PID" 2>/dev/null; then
    echo "FD ABRANTE3 SPOT 2 is already running (PID: $PID) at http://localhost:$PORT"
    open "http://localhost:$PORT" 2>/dev/null || true
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# Check if port is already in use by another process
EXISTING_PID=$(lsof -ti :"$PORT" 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  echo "Port $PORT is already in use by PID $EXISTING_PID."
  echo "You can stop it with: ./stop.sh"
  exit 1
fi

echo "Starting FD ABRANTE3 SPOT 2 Database Server on port $PORT..."
nohup python3 server.py > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

# Give the server a moment to bind
sleep 0.8

if kill -0 "$PID" 2>/dev/null; then
  echo "=========================================================="
  echo "  FD ABRANTE3 SPOT 2 – Daily Stock Keeper is RUNNING!"
  echo "  URL: http://localhost:$PORT"
  echo "  PID: $PID"
  echo "  Log: .server.log"
  echo "  To stop: run ./stop.sh or npm stop"
  echo "=========================================================="
  # Open in default web browser
  open "http://localhost:$PORT" 2>/dev/null || true
else
  echo "Failed to start server. Check .server.log for details:"
  cat "$LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
