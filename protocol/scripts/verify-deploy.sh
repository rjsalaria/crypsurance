#!/usr/bin/env bash
# Confirm what actually landed on devnet: program, size, and who can upgrade it.
set -uo pipefail
RPC="${RPC_URL:-https://api.devnet.solana.com}"
PROGRAM=4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr

echo "=== program account ==="
solana program show "$PROGRAM" --url "$RPC" 2>&1 | sed 's/^/  /'
echo
echo "=== deployer balance after deploy ==="
echo "  $(solana address): $(solana balance --url "$RPC" 2>&1 | head -1)"
