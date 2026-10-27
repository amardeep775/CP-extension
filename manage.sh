#!/bin/bash

# ==============================================================================
# CF Recall - MacBook Service Manager
# Controls the persistent background server and macOS auto-start service
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PLIST_NAME="com.amardeep.cfrecall.plist"
PLIST_SRC="$DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_FILE="$DIR/cfrecall.log"
PYTHON_BIN="$(which python3)"

# Create Plist template with absolute paths
cat << EOF > "$PLIST_SRC"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.amardeep.cfrecall</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON_BIN</string>
        <string>$DIR/backend/server.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>StandardOutPath</key>
    <string>$LOG_FILE</string>
    <key>StandardErrorPath</key>
    <string>$LOG_FILE</string>
</dict>
</plist>
EOF

case "$1" in
  enable-autostart)
    echo "⚙️ Setting up 24/7 Autostart on MacBook..."
    mkdir -p "$HOME/Library/LaunchAgents"
    # Unload previous if exists
    launchctl unload "$PLIST_DEST" 2>/dev/null
    cp "$PLIST_SRC" "$PLIST_DEST"
    launchctl load "$PLIST_DEST"
    sleep 1
    echo "✅ SUCCESS! CF Recall server is now set to run ALL THE TIME whenever you open your MacBook!"
    echo "🌐 Web Dashboard: http://localhost:3344"
    ;;

  disable-autostart)
    echo "🛑 Disabling MacBook Autostart..."
    launchctl unload "$PLIST_DEST" 2>/dev/null
    rm -f "$PLIST_DEST"
    echo "✅ Autostart disabled."
    ;;

  start)
    # Check if already running
    PID=$(lsof -ti:3344)
    if [ -n "$PID" ]; then
      echo "⚡ CF Recall server is ALREADY RUNNING on port 3344 (PID: $PID)"
      exit 0
    fi
    echo "🚀 Starting CF Recall backend server in background..."
    nohup "$PYTHON_BIN" "$DIR/backend/server.py" > "$LOG_FILE" 2>&1 &
    sleep 1
    PID=$(lsof -ti:3344)
    if [ -n "$PID" ]; then
      echo "✅ Server started successfully! PID: $PID"
      echo "🌐 Open Dashboard: http://localhost:3344"
    else
      echo "❌ Failed to start. Check logs: $LOG_FILE"
    fi
    ;;

  stop)
    echo "🛑 Stopping CF Recall server..."
    # Check if managed by launchctl
    if [ -f "$PLIST_DEST" ]; then
      launchctl unload "$PLIST_DEST" 2>/dev/null
    fi
    PID=$(lsof -ti:3344)
    if [ -n "$PID" ]; then
      kill -9 $PID 2>/dev/null
      echo "✅ Stopped server (PID: $PID)."
    else
      echo "ℹ️ No server was running on port 3344."
    fi
    ;;

  status)
    PID=$(lsof -ti:3344)
    if [ -n "$PID" ]; then
      echo "🟢 CF Recall server is RUNNING (PID: $PID, Port: 3344)"
      if [ -f "$PLIST_DEST" ]; then
        echo "⚡ MacBook Autostart: ENABLED (Runs every time you open MacBook)"
      else
        echo "⚠️ MacBook Autostart: Disabled (Run './manage.sh enable-autostart' to enable)"
      fi
      # Query status API
      curl -s http://localhost:3344/api/status | python3 -m json.tool
    else
      echo "🔴 CF Recall server is NOT running."
      if [ -f "$PLIST_DEST" ]; then
        echo "⚡ MacBook Autostart: Enabled (Will start on next login)"
      fi
    fi
    ;;

  logs)
    tail -n 40 "$LOG_FILE"
    ;;

  *)
    echo "CF Recall Manager"
    echo "Usage: ./manage.sh [start | stop | status | enable-autostart | disable-autostart | logs]"
    exit 1
    ;;
esac
