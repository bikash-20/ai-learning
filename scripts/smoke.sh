#!/usr/bin/env bash
# Live smoke test for Quantara (web + api).
# Hits every public-ish endpoint, asserts response shape and CORS,
# and exits non-zero on any failure. Run from repo root:
#   bash scripts/smoke.sh
#
# The script is deliberately dependency-free (curl + grep + python3).
# It does NOT touch authenticated routes — those need a signed
# better-auth cookie that we can't fabricate without going through
# the magic-link flow. The auth-gated routes are probed with the
# 'expect 401' contract instead.

set -uo pipefail

WEB="${WEB:-https://web-nine-rho-1j664llz3j.vercel.app}"
API="${API:-https://ai-learning-api.bikashtalukder040.workers.dev}"
ORIGIN="${ORIGIN:-https://web-nine-rho-1j664llz3j.vercel.app}"

fail=0
pass=0

assert_eq() {
  # assert_eq <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    echo "  PASS $1"
    pass=$((pass+1))
  else
    echo "  FAIL $1  expected=$2 actual=$3"
    fail=$((fail+1))
  fi
}

assert_match() {
  # assert_match <label> <regex> <value>
  if echo "$3" | grep -Eq "$2"; then
    echo "  PASS $1"
    pass=$((pass+1))
  else
    echo "  FAIL $1  regex=$2 value=$3"
    fail=$((fail+1))
  fi
}

probe() {
  # probe <label> <expected_status> <expected_acao> <curl args...>
  local label="$1" expected_status="$2" expected_acao="$3"
  shift 3
  local body status acao
  body=$(curl -s -o /tmp/smoke.body -w "%{http_code}|%header{access-control-allow-origin}" \
    --max-time 30 \
    -H "Origin: $ORIGIN" \
    "$@")
  status="${body%%|*}"
  acao="${body#*|}"
  assert_eq  "$label status"   "$expected_status" "$status"
  assert_eq  "$label ACAO"     "$expected_acao"   "$acao"
}

echo "== Web static =="
for p in / /sign-in /privacy /terms; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$WEB$p")
  assert_eq "GET $p status" "200" "$status"
done

echo "== API CORS preflight =="
status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,idempotency-key" \
  -X OPTIONS "$API/api/chat")
assert_eq "OPTIONS /api/chat preflight" "204" "$status"

echo "== API auth-gated routes (expect 401) =="
for route in /api/me /api/chat /api/quiz/from-topic /api/quiz/explain \
             /api/quiz/from-passage /api/exam/run /api/exam/submit \
             /api/me/prefs /api/me/progress /api/chat/history; do
  case "$route" in
    /api/quiz/from-topic|/api/quiz/from-passage|/api/exam/run|/api/exam/submit|/api/quiz/explain|/api/chat)
      method="-X POST"; content="-H Content-Type:application/json -d {}" ;;
    *)
      method=""; content="" ;;
  esac
  probe "auth-gated $route" 401 "$ORIGIN" $method $content "$API$route"
done

echo "== API public routes =="
# /api/health/models — should be 200 + report providers
out=$(curl -s --max-time 20 -H "Origin: $ORIGIN" "$API/api/health/models")
assert_match "/api/health/models has providers" '"providers"' "$out"
assert_match "/api/health/models has workers"  '"workers"'  "$out"
assert_match "/api/health/models has openrouter" '"openrouter"' "$out"

# /api/auth/sign-in/magic-link — should accept POST and return {"status":true}
# (or 502 with friendly body if Resend refuses the test recipient).
out=$(curl -s --max-time 20 \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -X POST "$API/api/auth/sign-in/magic-link" \
  -d '{"email":"bikashtalukder040@gmail.com","callbackURL":"https://web-nine-rho-1j664llz3j.vercel.app/chat"}')
if echo "$out" | grep -q '"status":true'; then
  echo "  PASS /api/auth/sign-in/magic-link (delivered)"
  pass=$((pass+1))
elif echo "$out" | grep -q '"code":"UPSTREAM_UNAVAILABLE"'; then
  echo "  PASS /api/auth/sign-in/magic-link (friendly 502 — Resend refused recipient)"
  pass=$((pass+1))
else
  echo "  FAIL /api/auth/sign-in/magic-link  body=$out"
  fail=$((fail+1))
fi

# /api/vocab — public vocab list (200 + items[])
out=$(curl -s --max-time 20 -H "Origin: $ORIGIN" "$API/api/vocab")
assert_match "/api/vocab has items" '"items"' "$out"

# /api/grammar — public grammar list (200 + items[])
out=$(curl -s --max-time 20 -H "Origin: $ORIGIN" "$API/api/grammar")
assert_match "/api/grammar has items" '"items"' "$out"

# /api/auth/get-session — unauthenticated returns {user:null} or empty
status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -H "Origin: $ORIGIN" "$API/api/auth/get-session")
assert_eq "GET /api/auth/get-session (no cookie)" "200" "$status"

echo "== Web asset paths =="
# image-set declarations reference /img/bg-login-{m,d}.webp + /img/bg-explore-{m,d}.webp
for p in /img/bg-login-m.webp /img/bg-login-d.webp /img/bg-explore-m.webp /img/bg-explore-d.webp \
         /bg-login.jpg /bg-explore.jpg /favicon.ico /favicon-32.png /favicon-16.png \
         /brand-mark.svg /apple-touch-icon.png /og-card.jpg /og-card.webp /manifest.webmanifest; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$WEB$p")
  assert_eq "GET $p" "200" "$status"
done

echo
echo "== Totals =="
echo "PASS=$pass FAIL=$fail"
exit "$fail"