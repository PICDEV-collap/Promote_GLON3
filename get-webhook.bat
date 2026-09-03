@echo off
title Get LINE Webhook URL
color 0B

echo ===================================================================
echo                  GENERATE LINE WEBHOOK URL (CLOUDFLARE)
echo ===================================================================
echo.
echo Starting secure tunnel for port 3333...
echo.
echo [INSTRUCTION]
echo Look for the URL ending with ".trycloudflare.com" below.
echo Add "/webhook" to it, for example:
echo https://xxxx.trycloudflare.com/webhook
echo.
echo Then paste it into LINE Developers -> Messaging API -> Webhook URL!
echo ===================================================================
echo.

npx --yes cloudflared tunnel --url http://localhost:3333

pause
