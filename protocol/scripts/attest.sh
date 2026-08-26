#!/usr/bin/env bash
#
# Run one operator's attestation pass in CI.
#
# Two things this does that an inline `node scripts/oracle.js` does not:
#
#   - deletes the keypair file even when the run fails. The old inline version
#     exited before its `rm`, leaving a private key on the runner. The runner
#     is ephemeral, but a key should not outlive the step that needed it.
#
#   - echoes the failure as a GitHub annotation. Reading raw workflow logs
#     needs repo-admin rights, so a failure that exists only in stdout is a
#     failure nobody can diagnose from outside the repo — which is exactly the
#     position we were in while this job flapped.
#
# Usage: scripts/attest.sh <label> <keypair-file>
set -uo pipefail

label="${1:?operator label}"
keyfile="${2:?keypair file}"

trap 'rm -f "$keyfile"' EXIT

out=$(KEYPAIR_PATH="$keyfile" node scripts/oracle.js 2>&1)
rc=$?

echo "$out"
if [ "$rc" -ne 0 ]; then
  # Last few lines only: enough to name the cause, short enough to read in the
  # annotation without opening the run.
  echo "::error::${label} failed (exit ${rc}): $(echo "$out" | tail -3 | tr '\n' ' ')"
fi
exit "$rc"
