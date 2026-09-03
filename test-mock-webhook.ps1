$body = @{
    events = @(
        @{
            type = "message"
            replyToken = "dummy_test_token"
            source = @{
                userId = "U0c10a5974f98b7ebb3367fd309f0222e"
            }
            message = @{
                type = "text"
                id = "12345"
                text = "144 2"
            }
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:3333/webhook" -Method POST -Body $body -ContentType "application/json"
