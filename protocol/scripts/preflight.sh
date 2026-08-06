#!/usr/bin/env bash
# Pre-deploy check: who holds which key, and is there enough SOL to deploy?
set -uo pipefail

RPC="${RPC_URL:-https://api.devnet.solana.com}"
POOL=9txXv5nFKu4E9AmykbcLGSRiyxM19C81HJqFmJbsBkxy
SO=/mnt/d/Workplace/Crypsurance/protocol/target/deploy/protocol.so

ADDR=$(solana address 2>/dev/null)
echo "RPC: ${RPC%%\?*}"
echo
echo "upgrade/pool authority candidate (WSL default keypair)"
echo "  address: ${ADDR:-<none>}"
echo "  balance: $(solana balance --url "$RPC" 2>&1 | head -1)"
echo
echo "oracle wallet (key already lives on the Cloudflare Worker)"
echo "  address: $POOL"
echo "  balance: $(solana balance "$POOL" --url "$RPC" 2>&1 | head -1)"
echo
SIZE=$(stat -c %s "$SO")
echo "program: $SIZE bytes"
echo "  rent-exempt minimum: $(solana rent "$SIZE" --url "$RPC" 2>&1 | grep -i 'rent-exempt' | head -1)"
echo "  (a deploy also needs a temporary buffer of about the same size again)"
