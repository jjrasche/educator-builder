#!/bin/bash

SESSION_ID="curl_test_$(date +%s)"

echo "Testing API with 5 user turns..."
echo "Session: $SESSION_ID"
echo ""

curl -X POST https://educator-builder.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Turn 1"},
      {"role": "assistant", "content": "Response 1"},
      {"role": "user", "content": "Turn 2"},
      {"role": "assistant", "content": "Response 2"},
      {"role": "user", "content": "Turn 3"},
      {"role": "assistant", "content": "Response 3"},
      {"role": "user", "content": "Turn 4"},
      {"role": "assistant", "content": "Response 4"},
      {"role": "user", "content": "Turn 5 - should trigger assessment"}
    ],
    "sessionId": "'$SESSION_ID'",
    "email": null
  }' 2>/dev/null | grep -o 'data: .*' | head -20
