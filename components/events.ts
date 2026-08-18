/**
 * Cross-component browser events.
 *
 * Deliberately dependency-free: the faucet card and the wallet panel are
 * siblings with no shared state and no common provider, and a constant should
 * not drag the wallet-adapter bundle into a component that has no wallet.
 */

/**
 * The faucet has credited an address. The wallet panel listens and re-reads
 * balances — without it, tokens only appear after a disconnect and reconnect.
 *
 * detail: `{ address: string }`
 */
export const FUNDED_EVENT = "surety:funded";
