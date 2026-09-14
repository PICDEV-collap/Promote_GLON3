$body = @{
    events = @(
        @{
            type = "message"
            replyToken = "dummy_test_token"
            source = @{
                userId = "U_dummy_mock_user_id"
            }
            message = @{
                type = "text"
                id = "12345"
                text = "123 2, 456 1, 789 3"
            }
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:3333/webhook" -Method POST -Body $body -ContentType "application/json"
