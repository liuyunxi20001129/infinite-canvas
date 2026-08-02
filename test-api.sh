#!/bin/bash
BASE="http://localhost:8000"
USER="user_$(date +%s)"

echo "=== 1. 注册新用户 ($USER) ==="
REGISTER_RESP=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"test123456\"}")
echo "$REGISTER_RESP"
TOKEN=$(echo "$REGISTER_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "注册失败，尝试登录..."
  LOGIN_RESP=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USER\",\"password\":\"test123456\"}")
  echo "$LOGIN_RESP"
  TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

echo ""
echo "=== 2. 获取用户信息 ==="
curl -s "$BASE/api/user/profile" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 3. 重复注册（应报错） ==="
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"test123456\"}"
echo ""

echo ""
echo "=== 4. 错误密码登录（应报错） ==="
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"wrongpassword\"}"
echo ""

echo ""
echo "=== 5. 获取充值套餐 ==="
curl -s "$BASE/api/recharge/packages"
echo ""

echo ""
echo "=== 6. 创建充值订单 ==="
ORDER_RESP=$(curl -s -X POST "$BASE/api/recharge/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"packageId":"pkg_50","method":"alipay"}')
echo "$ORDER_RESP"
ORDER_NO=$(echo "$ORDER_RESP" | grep -o '"orderNo":"[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
echo "=== 7. 模拟支付 ==="
curl -s -X POST "$BASE/api/recharge/mock-pay" \
  -d "order=$ORDER_NO"
echo ""

echo ""
echo "=== 8. 查询充值后余额 ==="
curl -s "$BASE/api/user/profile" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 9. 获取交易记录 ==="
curl -s "$BASE/api/user/transactions" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 10. 获取使用记录 ==="
curl -s "$BASE/api/user/usage" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 11. 获取可用模型列表 ==="
curl -s "$BASE/v1/models" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 12. 未认证访问（应报错） ==="
curl -s "$BASE/api/user/profile"
echo ""

echo ""
echo "=== 13. 管理员手动充值 ==="
curl -s -X POST "$BASE/api/recharge/admin" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"username\":\"$USER\",\"amount\":500,\"adminPassword\":\"admin123\"}"
echo ""

echo ""
echo "=== 14. 充值后余额 ==="
curl -s "$BASE/api/user/profile" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== ALL TESTS DONE ==="
