@echo off
title LINE Webhook Public Tunnel
color 0E

echo ========================================================
echo        LINE WEBHOOK PUBLIC TUNNEL (HTTPS)
echo ========================================================
echo.
echo Connecting Port 3333 to Public Internet...
echo.
echo [INSTRUCTION]
echo 1. Copy the HTTPS URL shown below.
echo 2. Add "/webhook" at the end.
echo    Example: https://your-tunnel-url.loca.lt/webhook
echo 3. Paste it into LINE Developers -> Messaging API -> Webhook URL
echo 4. Click "Verify" and turn "Use Webhook: ON"
echo.
echo ========================================================

call npx localtunnel --port 3333

pause
