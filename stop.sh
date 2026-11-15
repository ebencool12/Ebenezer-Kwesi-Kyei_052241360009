#!/usr/bin/env bash

# FD ABRANTE3 SPOT 2 - Stop Script
PORT="${PORT:-4173}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.server.pid"

cd "$DIR" || exit 1

STOPPED=0

# 1. Check PID file
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "Stopping FD ABRANTE3 SPOT 2 (PID: $PID)..."
    kill "$PID" 2>/dev/null
    sleep 0.5
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    STOPPED=1
  fi
  rm -f "$PID_FILE"
fi

# 2. Check any remaining process on the configured port
PORT_PID=$(lsof -ti :"$PORT" 2>/dev/null)
if [ -n "$PORT_PID" ]; then
  echo "Terminating process on port $PORT (PID: $PORT_PID)..."
  kill "$PORT_PID" 2>/dev/null
  sleep 0.5
  if kill -0 "$PORT_PID" 2>/dev/null; then
    kill -9 "$PORT_PID" 2>/dev/null || true
  fi
  STOPPED=1
fi

if [ "$STOPPED" -eq 1 ]; then
  echo "FD ABRANTE3 SPOT 2 server has been STOPPED."
else
  echo "FD ABRANTE3 SPOT 2 server is not currently running."
fi
