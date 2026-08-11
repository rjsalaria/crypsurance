/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/protocol.json`.
 */
export type Protocol = {
  "address": "4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr",
  "metadata": {
    "name": "protocol",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "CrypSurance parametric cover protocol"
  },
  "instructions": [
    {
      "name": "buyCover",
      "docs": [
        "Buy cover. The premium is derived from the payout here rather than",
        "taken from the caller, so it cannot be understated."
      ],
      "discriminator": [
        43,
        59,
        234,
        123,
        199,
        21,
        0,
        167
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "holderToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "flight",
          "type": "string"
        },
        {
          "name": "date",
          "type": "string"
        },
        {
          "name": "payout",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deregisterOperator",
      "docs": [
        "Leave the operator set and take the stake back.",
        "",
        "Refused while the operator has attestations on claims that haven't",
        "settled yet — otherwise an operator could vote, see the verdict going",
        "against them, and withdraw before week 3's slashing could reach the",
        "stake."
      ],
      "discriminator": [
        229,
        98,
        238,
        100,
        57,
        56,
        156,
        124
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "operator"
          ]
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "`has_one` means only the operator's own key can withdraw its stake —",
            "the pool admin cannot deregister someone else and take it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "escalateClaim",
      "docs": [
        "The data was inconclusive: hand the claim to human verification rather",
        "than guessing. It stays settleable afterwards."
      ],
      "discriminator": [
        96,
        28,
        94,
        195,
        201,
        64,
        213,
        181
      ],
      "accounts": [
        {
          "name": "oracle",
          "docs": [
            "Only the pool's designated oracle may assess a claim."
          ],
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.holder",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.nonce",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "holderToken",
          "docs": [
            "Must belong to the policy holder — the oracle cannot redirect a payout."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "fileClaim",
      "docs": [
        "Ask for the claim to be assessed. Only the holder can do this, and only",
        "on a policy that hasn't already been claimed or settled."
      ],
      "discriminator": [
        187,
        254,
        40,
        13,
        146,
        223,
        230,
        97
      ],
      "accounts": [
        {
          "name": "holder",
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "account",
                "path": "policy.nonce",
                "account": "policy"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initializePool",
      "docs": [
        "Create the pool and its vault. The vault's authority is the pool PDA,",
        "which is what makes the funds unspendable by any private key."
      ],
      "discriminator": [
        95,
        180,
        10,
        172,
        84,
        174,
        232,
        40
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializeRegistry",
      "docs": [
        "Create the operator registry and its stake vault.",
        "",
        "The registry is a separate account rather than extra fields on `Pool`",
        "on purpose: the pool is already live on devnet holding policy counters",
        "and a funded vault, and growing a money-holding account in place is a",
        "migration, not a feature. Everything M3 adds is additive, so M2's",
        "tested paths keep working untouched while consensus is built beside",
        "them."
      ],
      "discriminator": [
        189,
        181,
        20,
        17,
        174,
        57,
        249,
        59
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "docs": [
            "Stake sits under the same PDA authority as premiums do."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "minStake",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerOperator",
      "docs": [
        "Join the operator set by staking SURETY.",
        "",
        "Registration is permissionless — that is the whole point of the",
        "milestone. What keeps it honest is the stake: it sits in a vault owned",
        "by the pool PDA, on the same terms as premiums, and week 3 makes it",
        "slashable when an operator's attestation disagrees with the outcome."
      ],
      "discriminator": [
        49,
        242,
        151,
        125,
        212,
        136,
        31,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Anyone may register — the stake is the gate, not a permission list."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "operator",
          "docs": [
            "One per authority, enforced by the seeds: registering twice fails",
            "because the account already exists, not because of a check we wrote."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "operatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stake",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setOracle",
      "docs": [
        "Hand the oracle role to a different key (admin only)."
      ],
      "discriminator": [
        186,
        128,
        81,
        104,
        74,
        79,
        18,
        224
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "pool"
          ]
        }
      ],
      "args": [
        {
          "name": "newOracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setThreshold",
      "docs": [
        "Change how many agreeing attestations settle a claim (admin only)."
      ],
      "discriminator": [
        155,
        53,
        245,
        104,
        116,
        169,
        239,
        167
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "registry.pool",
                "account": "registry"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "registry"
          ]
        }
      ],
      "args": [
        {
          "name": "threshold",
          "type": "u8"
        }
      ]
    },
    {
      "name": "settleClaim",
      "docs": [
        "Oracle verdict. `approved` pays the full payout from the vault to the",
        "holder; otherwise the claim is denied. The oracle cannot choose the",
        "recipient or the amount — both come from the policy account."
      ],
      "discriminator": [
        205,
        203,
        21,
        66,
        255,
        231,
        209,
        155
      ],
      "accounts": [
        {
          "name": "oracle",
          "docs": [
            "Only the pool's designated oracle may assess a claim."
          ],
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.holder",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.nonce",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "holderToken",
          "docs": [
            "Must belong to the policy holder — the oracle cannot redirect a payout."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "approved",
          "type": "bool"
        },
        {
          "name": "basis",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "operator",
      "discriminator": [
        219,
        31,
        188,
        145,
        69,
        139,
        204,
        117
      ]
    },
    {
      "name": "policy",
      "discriminator": [
        222,
        135,
        7,
        163,
        235,
        177,
        33,
        68
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    }
  ],
  "events": [
    {
      "name": "claimEscalated",
      "discriminator": [
        121,
        86,
        179,
        62,
        10,
        232,
        213,
        244
      ]
    },
    {
      "name": "claimFiled",
      "discriminator": [
        78,
        228,
        214,
        247,
        197,
        67,
        130,
        19
      ]
    },
    {
      "name": "claimSettled",
      "discriminator": [
        144,
        220,
        131,
        115,
        8,
        187,
        224,
        236
      ]
    },
    {
      "name": "coverBought",
      "discriminator": [
        128,
        196,
        83,
        24,
        47,
        194,
        179,
        102
      ]
    },
    {
      "name": "operatorDeregistered",
      "discriminator": [
        106,
        160,
        149,
        238,
        140,
        139,
        115,
        55
      ]
    },
    {
      "name": "operatorRegistered",
      "discriminator": [
        173,
        220,
        230,
        105,
        117,
        97,
        22,
        133
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "payoutOutOfRange",
      "msg": "Payout is outside the permitted range"
    },
    {
      "code": 6001,
      "name": "badFlight",
      "msg": "Flight number is missing or too long"
    },
    {
      "code": 6002,
      "name": "badDate",
      "msg": "Date must be YYYY-MM-DD"
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6004,
      "name": "notClaimable",
      "msg": "This policy cannot be claimed in its current state"
    },
    {
      "code": 6005,
      "name": "notSettleable",
      "msg": "This claim cannot be settled in its current state"
    },
    {
      "code": 6006,
      "name": "notOracle",
      "msg": "Only the pool oracle may settle claims"
    },
    {
      "code": 6007,
      "name": "notPolicyHolder",
      "msg": "Only the policy holder may file this claim"
    },
    {
      "code": 6008,
      "name": "wrongTokenOwner",
      "msg": "Token account has the wrong owner"
    },
    {
      "code": 6009,
      "name": "wrongMint",
      "msg": "Token account has the wrong mint"
    },
    {
      "code": 6010,
      "name": "poolUnderfunded",
      "msg": "The pool does not hold enough to cover this payout"
    },
    {
      "code": 6011,
      "name": "basisTooLong",
      "msg": "Basis string is too long"
    },
    {
      "code": 6012,
      "name": "badThreshold",
      "msg": "Threshold must be at least 1"
    },
    {
      "code": 6013,
      "name": "stakeBelowMinimum",
      "msg": "Stake is below the registry minimum"
    },
    {
      "code": 6014,
      "name": "operatorHasPendingAttestations",
      "msg": "Operator still has attestations on unsettled claims"
    },
    {
      "code": 6015,
      "name": "notOperator",
      "msg": "Signer is not this operator"
    }
  ],
  "types": [
    {
      "name": "claimEscalated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "claimFiled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "claimSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "basis",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "coverBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "flight",
            "type": "string"
          },
          {
            "name": "date",
            "type": "string"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "operator",
      "docs": [
        "One registered claim verifier.",
        "",
        "`attestations` / `agreed` are a public track record: an operator that keeps",
        "disagreeing with settled outcomes is visible before it is ever slashed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "docs": [
              "Whole tokens, like payouts and premiums everywhere else."
            ],
            "type": "u64"
          },
          {
            "name": "attestations",
            "type": "u64"
          },
          {
            "name": "agreed",
            "type": "u64"
          },
          {
            "name": "pending",
            "docs": [
              "Attestations on claims that haven't settled yet. Blocks withdrawal."
            ],
            "type": "u32"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "operatorDeregistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "operatorRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "policy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "flight",
            "type": "string"
          },
          {
            "name": "date",
            "type": "string"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "policyStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "basis",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "policyStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "requested"
          },
          {
            "name": "escalated"
          },
          {
            "name": "paid"
          },
          {
            "name": "denied"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "docs": [
              "Decimals of `mint`, so whole-token amounts can be converted to base",
              "units without hardcoding a value that only holds for SURETY."
            ],
            "type": "u8"
          },
          {
            "name": "policies",
            "type": "u64"
          },
          {
            "name": "claimsPaid",
            "type": "u64"
          },
          {
            "name": "claimsDenied",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "registry",
      "docs": [
        "Consensus configuration and the operator roll-call.",
        "",
        "Deliberately separate from `Pool` — see `initialize_registry`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "threshold",
            "docs": [
              "Agreeing attestations required to settle a claim."
            ],
            "type": "u8"
          },
          {
            "name": "minStake",
            "docs": [
              "Whole tokens an operator must stake to join."
            ],
            "type": "u64"
          },
          {
            "name": "operatorCount",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "stakeVaultBump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
