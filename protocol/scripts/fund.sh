#!/usr/bin/env bash
# Top up the deploy/upgrade-authority keypair on devnet.
# Faucets are rate-limited, so try a few sources and report what stuck.
set -uo pipefail

ADDR=$(solana address)
HELIUS="${RPC_URL:-}"
PUBLIC=https://api.devnet.solana.com

bal() { solana balance "$ADDR" --url "${1:-$PUBLIC}" 2>/dev/null | awk '{print $1}'; }

echo "funding $ADDR"
echo "starting balance: $(bal "$PUBLIC") SOL"

for i in 1 2 3; do
  for url in "$PUBLIC" ${HELIUS:+"$HELIUS"}; do
    out=$(solana airdrop 2 "$ADDR" --url "$url" 2>&1 | tail -1)
    echo "  attempt $i @ ${url%%\?*}: $out"
    sleep 3
  done
done

echo "final balance: $(bal "$PUBLIC") SOL"
