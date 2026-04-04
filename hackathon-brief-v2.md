# THE $10 TABLE: AI Poker Night — v2

> **Builder opens at 9 AM. You have 12 hours. This document is your north star.**

---

## 1. The Pitch

Six foundation models sit down at the same table. Each one gets funded with $10 USDC on Base Sepolia. Each one receives the identical system prompt — no personality tweaks, no handicapping, no special instructions. They all see the same structured game state. They all play the same game by the same rules. And then we find out: which foundation model is actually the best poker player? GPT raises $0.50. The payment fires immediately — an x402 micropayment from its OWS wallet to the pot, settled on-chain in 200 milliseconds, tx hash visible on Basescan. Claude folds. Gemini calls. You can read every model's chain of thought on the screen as they decide. This is not a personality contest. It is a benchmark. A controlled experiment that runs for as long as it takes to eliminate five of the six contestants. Real money. Real decisions. Real reasoning. No human players.

> **"Same cards. Same rules. Same prompt. Different brains. Real money."**

---

## 2. Why This Wins

### Novelty: What Exists vs. What Doesn't

The prior art landscape is clear and entirely in your favor:

| Project | What It Is | Real Money? | Identical Prompts? |
|---------|-----------|-------------|-------------------|
| **ClawPoker** (Feb 2026) | GPT, Claude, Gemini playing Hold'em with a visual table | ❌ No | ❌ No — each has a different style |
| **Vals.ai Poker Benchmark** (Dec 2025) | 17 frontier models, 20,000 hands, TrueSkill ratings | ❌ No | Unclear — likely tuned per model |
| **PokerGPT** (arXiv 2401.06781) | Fine-tuned LLM for Hold'em with RL | ❌ No | N/A — single model |
| **Stanford CS224R Research** | LLM strategy via PettingZoo + Monte Carlo | ❌ No | N/A — research context |
| **THE $10 TABLE v1** | AI agents + OWS wallets + x402 micropayments | ✅ Yes | ❌ No — had distinct personalities |
| **THE $10 TABLE v2** | Same as above, but a **pure model benchmark** | ✅ Yes | ✅ Yes — identical prompt for all |

The Vals.ai benchmark is the closest competitor — 20,000 hands, real TrueSkill ratings. But it has no money moving, no live visualization, and no public theater. You're not replicating a research paper; you're staging a live event where the audience watches real USDC move between AI wallets in real time while reading the models' actual reasoning. That combination does not exist.

### Visual Impact: The 30-Second Judge Test

A judge who has never heard of x402 or OWS looks at the screen and immediately understands everything: six AI logos around a poker table, chip stacks in USDC, cards on a felt surface, and a scrolling feed showing `GPT → Pot: $0.50 USDC (0x3a8f...)`. The thinking panel at the bottom shows GPT's actual reasoning text streaming in real time. No explanation required. The demo narrates itself.

Compare this to the alternatives: a DeFi agent (requires explaining GTO strategy), a DAO governance tool (requires explaining proposal mechanics), an autonomous market maker (requires explaining AMM math). Poker requires zero setup. Every judge knows what a poker hand is. The wow-factor lands in the first five seconds.

### Hackathon Pattern Alignment

Games dominate ETHGlobal finals. Bangkok 2024 had 4/10 finalists as games. Prague 2025 had Yetris and Pomodoki. NYC 2025 had Rivals. Games that can be demonstrated live in under five minutes win hearts and finalist slots. Real money beats testnet money — the single most powerful visual in a crypto hackathon demo is actual token balances changing on screen. AI agents that execute real transactions won bounties across every 2025 ETHGlobal event. This project is the intersection of all three winning patterns: a game, real money, and AI agents making autonomous decisions with verifiable on-chain proof of every action.

### The Benchmark Angle Is New and Better

The v1 framing — "watch AIs with funny personalities" — is entertaining but shallow. The v2 framing is a *scientific question* with a verifiable answer: which foundation model has the best poker intuition when given identical information? This framing resonates with:

- **AI researchers** who find the benchmark angle intellectually interesting
- **Crypto judges** who care about real payments flowing through the system  
- **General audiences** who already have opinions about GPT vs. Claude and want to see them fight
- **Judges evaluating x402/OWS** who see every game action as a payment, which is the core protocol demonstration

The question "who wins?" creates narrative tension that a DeFi agent simply cannot generate.

---

## 3. Technical Architecture — How Poker + x402 + OWS Actually Combine

### 3a. The Core Insight: Poker Actions ARE x402 Payments

This is the architectural decision that everything else flows from, and it's worth being precise about it: **you don't have a poker engine that also does payments — the poker engine's bet mechanism IS the x402 protocol**.

Here is exactly what happens when GPT decides to bet $0.50:

```
1. GPT agent process calls:
   POST http://localhost:8000/game/action
   Body: { "action": "bet", "amount": 0.50, "agentId": "gpt" }

2. The Express server has x402 paymentMiddleware on /game/action.
   The middleware is configured with dynamic pricing — the price field
   is computed at request time from the action + amount in the request body.
   The server returns:
   
   HTTP 402 Payment Required
   PAYMENT-REQUIRED: {
     "scheme": "exact",
     "price": "$0.50",
     "network": "eip155:84532",
     "payTo": "0x<POT_WALLET_ADDRESS>",
     "description": "GPT bet — Hand #47 Pre-Flop"
   }

3. The GPT agent's x402 client (@x402/fetch with wrapFetchWithPayment)
   automatically intercepts the 402 response.
   It reads the PAYMENT-REQUIRED header.

4. The agent's viem account (derived from the OWS wallet — see §3b for the
   critical bridging question) signs the EIP-3009 authorization payload.
   The ExactEvmScheme constructs the payment and attaches it as:
   
   PAYMENT-SIGNATURE: <signed EIP-712 payload>

5. The x402 client retries the original request with the PAYMENT-SIGNATURE header.

6. The x402 middleware on the server calls the facilitator:
   POST https://x402.org/facilitator/verify
   The facilitator verifies the signature and submits the USDC transfer
   on Base Sepolia (~200ms).

7. The facilitator returns settlement confirmation.
   The middleware attaches:
   PAYMENT-RESPONSE: { "txHash": "0x...", "status": "settled" }
   And allows the request to pass through to the route handler.

8. The route handler (now running inside authenticated middleware context)
   processes the poker action via the game engine and returns:
   HTTP 200 OK
   Body: { "gameState": { ... }, "txHash": "0x...", "settled": true }

9. The server broadcasts via WebSocket to all connected dashboard clients:
   {
     "type": "action",
     "agent": "gpt",
     "action": "bet",
     "amount": 0.50,
     "pot": 1.30,
     "txHash": "0x...",
     "reasoning": "Top pair with flush draw. Pot odds 2.4:1. Positive EV. Bet."
   }
```

**Why this matters architecturally**: The HTTP protocol itself enforces that you cannot register a poker action without USDC moving. There is no database flag to update, no promise to track, no reconciliation needed. The `200 OK` response from the middleware IS the proof that the payment settled. The game state update and the payment are atomically coupled at the HTTP layer — you literally cannot get one without the other.

This is what makes it a real demonstration of x402's value proposition, not just a payments system bolted onto a poker game.

### 3b. The OWS ↔ viem Bridging Problem (And Its Solution)

This is the most technically nuanced part of the integration, and it's worth thinking through carefully because hackathon judges will look at exactly this seam.

**The problem in one sentence**: x402's client library (`@x402/fetch` with `ExactEvmScheme`) requires a `viem` account object created via `privateKeyToAccount(key)`. OWS, by design, never exposes raw private keys — its entire value proposition is that signing happens inside a hardened process and key material is wiped from memory after use. How do you give viem a signer that is backed by OWS without defeating OWS's security model?

**Option A: Export the private key from OWS**

```bash
ows wallet export --wallet gpt
```

This gives you a hex private key you pass to `privateKeyToAccount`. Simple, works immediately, gets the demo running. The security model is weakened — the key is now in your environment — but for a hackathon with testnet funds, this is the pragmatic choice. The keys are protecting $10 of testnet USDC, not production funds.

**Option B: Use `ows pay request` CLI as the x402 client**

OWS has a built-in x402 client:

```bash
ows pay request --wallet gpt \
  --url http://localhost:8000/game/action \
  --method POST \
  --body '{"action":"bet","amount":0.50,"agentId":"gpt"}'
```

This means OWS handles the full 402 → sign → retry cycle natively, using its own internal signing without ever exposing keys. The agent process calls `ows pay request` via a child process spawn or shell exec. Clean, correct, and OWS-native. The downside: you're shelling out for every poker action, adding latency (maybe 100-200ms per call), and making the agent code more complex.

**Option C: OWS MCP Server + Custom viem Account**

OWS exposes an MCP (Model Context Protocol) server. You could implement a custom viem account that, instead of signing locally, calls the OWS MCP signing endpoint. This is the architecturally cleanest solution but requires implementing a custom viem `LocalAccount` adapter with a `signTypedData` hook that proxies to OWS. For a 12-hour hackathon, this is too much surface area.

**Option D: OWS REST API as the signing backend**

OWS exposes a local REST API (runs at `~/.ows/socket` or a local port). The `SignRequest` interface accepts:

```typescript
{
  walletId: string;       // UUID of the wallet
  chainId: string;        // CAIP-2 e.g. "eip155:84532"
  payload: string;        // The data to sign
  policyIds?: string[];   // Optional policy gate
}
```

You could implement a thin wrapper that satisfies viem's `signTypedData` interface by making an HTTP call to the OWS REST API. This preserves OWS key custody while giving viem the signer it needs.

**The recommendation for this hackathon**: Use **Option A** during the build phase to get end-to-end working fast, and mention Options B and D in your pitch as "the production path." Judges care that you understand the tradeoff. A one-liner in your demo: *"For the hackathon, we're using OWS-generated private keys fed to viem — in production, we'd proxy signing through OWS's signing API so keys never leave the vault."* This is honest, technically informed, and shows architectural awareness. That is more impressive than a working but opaque Option B integration.

The key framing for judges: OWS still provides value even in Option A — it creates the wallets, derives the addresses, manages the key files in its encrypted vault at `~/.ows/wallets/`, and provides policy infrastructure (`ows policy create`) that you can gate the agent behavior on. The wallet creation, address derivation, and policy model are all OWS. The signing step for x402 uses the exported key with viem. This is a legitimate hybrid that leverages OWS's real capabilities.

### 3c. How the LLM Poker Agent Actually Works

Each model is an identical process wrapper with a different API endpoint and model name. The architecture treats models as interchangeable inference endpoints. Here is the full agent loop:

**Pre-computation (done by the server before calling any LLM):**

The server uses `pokersolver` (Node.js, `npm install pokersolver`) to evaluate hand strength. This is critical: you are not asking the LLM to calculate hand strength. You are pre-computing it and handing the LLM a structured input:

```typescript
import { Hand } from 'pokersolver';

function evaluateHand(holeCards: string[], communityCards: string[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (communityCards.length === 0) {
    // Pre-flop: compute equity via Monte Carlo (fast, ~5ms for 1000 simulations)
    return { rank: 'Pre-flop', rankPercentile: prelopEquityTable[holeCards.sort().join(',')], equity: prelopEquity };
  }
  const hand = Hand.solve(allCards);
  return {
    rank: hand.name,           // e.g. "Flush", "Two Pair", "High Card"
    rankPercentile: handPercentile(hand.rank), // where it sits vs. all possible hands
    equity: monteCarloEquity(holeCards, communityCards, activePlayers, 500)
  };
}
```

The `equity` number (what percentage of the time this hand wins at showdown) is computed via a 500-simulation Monte Carlo in ~3ms in Node.js. Fast enough that it's transparent to the user.

**The structured game state** fed to the LLM each turn:

```
Hand #{{hand_number}} | Phase: {{phase}}
Your cards: {{hole_cards}}
Community: {{community_cards}}
Your stack: ${{stack}} USDC | Pot: ${{pot}} USDC
Hand strength: {{hand_rank}} ({{hand_percentile}}th percentile of all possible hands)
Equity: {{equity}}% (probability of winning at showdown vs. {{active_players}} opponents)
To call: ${{call_amount}} | Min raise: ${{min_raise}} | Max raise: ${{max_raise}}
Pot odds: {{pot_odds}} (you risk ${{call_amount}} to win ${{pot}})
Position: {{position}} ({{seats_from_dealer}} seat(s) from dealer button)
Actions this round: {{action_history}}
Your action?
```

**Why pre-computation is essential**: LLMs are unreliable at arithmetic. If you ask Claude to compute pot odds from raw numbers, it will be wrong 20% of the time. By handing it pre-computed `equity: 64%` and `pot_odds: 2.8:1`, you reduce the LLM's job to a single strategic judgment: "given these pre-computed numbers, what is my action?" This makes the benchmark actually test strategic reasoning rather than arithmetic accuracy.

**The response format** (JSON, enforced by the system prompt):

```json
{
  "action": "raise",
  "amount": 0.75,
  "reasoning": "Top pair with nut flush draw. Pot odds 2.8:1 favor a call, but my equity (64%) justifies a raise to charge drawing hands. Raising 75% pot."
}
```

The `reasoning` field is what streams to the thinking panel on the dashboard. This is the entertainment. The audience reads GPT's actual thought process in real time.

**Fallback behavior**: If the LLM returns invalid JSON, or times out (8 seconds), or returns an action outside the valid set, the game server substitutes a fold. This prevents the game from halting. The dashboard shows `[TIMEOUT → fold]` in the thinking panel, which is itself informative.

**Model routing** — all models receive identical prompts, different API endpoints:

```typescript
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt':    { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b', apiKey: process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY },
  'claude':    { baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5', apiKey: process.env.CLAUDE_API_KEY ?? process.env.OPENROUTER_API_KEY },
  'grok':      { baseURL: 'https://openrouter.ai/api/v1', model: 'x-ai/grok-4.1-fast', apiKey: process.env.XAI_API_KEY ?? process.env.OPENROUTER_API_KEY },
  'mistral':   { baseURL: 'https://openrouter.ai/api/v1', model: 'mistralai/mistral-small-3.1-24b-instruct:free', apiKey: process.env.MISTRAL_API_KEY ?? process.env.OPENROUTER_API_KEY },
  'deepseek':  { baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v3.2', apiKey: process.env.DEEPSEEK_API_KEY ?? process.env.OPENROUTER_API_KEY },
  'gemini':    { baseURL: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY ?? process.env.OPENROUTER_API_KEY },
};
```

All six models receive the same system prompt, the same per-turn user message template, and the same `max_tokens: 200` constraint. No model gets special treatment.

### 3d. The x402 Payment Server Architecture

After thinking through the three architectural options, here is the analysis:

**Option A: Two servers (Express + FastAPI)**

Separate the x402/Node.js layer from the game logic/Python layer. They communicate via HTTP. You get PokerKit (the most complete open-source Hold'em library, peer-reviewed, handles side pots and split pots automatically) and native x402 Node.js support in the same project. The cost: two processes to manage, an HTTP hop between them per action, more configuration surface area.

**Option B: All Node.js (Express for everything)**

Single Express process handles x402 middleware, game logic, and WebSocket. Use `pokersolver` for hand evaluation instead of PokerKit. `pokersolver` is battle-tested (13M+ weekly downloads), handles full Texas Hold'em hand ranking correctly, and evaluates a hand in under 0.1ms. The tradeoff: you lose PokerKit's automated blind rotation, side pot calculation, and all-in handling. You implement these yourself in TypeScript. That's roughly 200-300 lines of well-understood poker logic.

**Option C: All Python (FastAPI with x402 Python SDK)**

x402 has a Python client (`pip install x402`) and the FastAPI ecosystem, but the x402 Python *server-side middleware* for FastAPI is less mature than `x402-express`. The seller quickstart and the primary examples are all Node.js. Using Python server-side means adapting the x402 payment verification flow manually rather than using the first-class `paymentMiddleware` abstraction.

**Recommendation: Option B (All Node.js)**

For a 12-hour hackathon where the builder is strong in TypeScript:

1. `x402-express` is first-class and battle-tested — it's what the docs use
2. `pokersolver` handles hand evaluation correctly out of the box
3. Single process means single `PORT`, single log stream, single debugger session
4. WebSocket lives in the same process as game logic — no cross-process state synchronization
5. LLM API calls via `fetch` or `axios` are idiomatic in Node.js
6. The poker logic you need to implement manually (blind rotation, side pots) is roughly 300 lines and well-documented

The concession is PokerKit's elegant abstractions. The tradeoff is worth it: you'll spend the hours saved on two-server debugging polishing the dashboard instead.

**The server block diagram:**

```
Express Server (Node.js, port 8000)
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  paymentMiddleware (@x402/express)                              │
│    Route: POST /game/action                                     │
│    Dynamic price = req.body.amount (set by game engine)         │
│    payTo = POT_WALLET_ADDRESS                                   │
│    network = eip155:84532 (Base Sepolia)                        │
│    facilitator = https://x402.org/facilitator                   │
│                                                                 │
│  Game Engine (poker-engine.ts)                                  │
│    Deck management, blind rotation, betting rounds              │
│    Showdown resolution (pokersolver)                            │
│    Hand evaluation + Monte Carlo equity                         │
│                                                                 │
│  LLM Agent (llm-agent.ts)                                       │
│    One function: getAgentAction(agentId, gameState)             │
│    Routes to the correct API based on MODEL_CONFIGS             │
│    Parses JSON response, falls back to fold on failure          │
│                                                                 │
│  x402 Client Manager (x402-setup.ts)                           │
│    6 wrapFetchWithPayment instances (one per agent)             │
│    Each backed by its agent's viem account (from OWS key)       │
│                                                                 │
│  WebSocket (ws library)                                         │
│    Broadcasts game state after every action                     │
│    Connects to dashboard at ws://localhost:8000/ws              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  x402.org/facilitator      Browser Dashboard
  Base Sepolia USDC          React + Tailwind
  Basescan explorer          (port 5173, Vite)
```

**The dynamic pricing middleware**: `paymentMiddleware` normally takes a static price configuration. For poker, the bet amount is determined at runtime by the agent's decision. The clean solution is a middleware wrapper that reads `req.body.amount` and constructs the payment configuration dynamically before calling the x402 middleware:

```typescript
app.post('/game/action', async (req, res, next) => {
  // First: attach dynamic x402 config based on the action
  const { amount, agentId } = req.body;
  req.x402Config = {
    price: `$${amount.toFixed(6)}`,
    payTo: POT_WALLET_ADDRESS,
    network: 'eip155:84532',
  };
  next();
}, paymentMiddlewareDynamic, async (req, res) => {
  // This handler only runs after payment is confirmed
  const gameState = await gameEngine.processAction(req.body);
  wss.broadcast({ type: 'action', ...gameState, txHash: req.paymentTxHash });
  res.json({ success: true, gameState });
});
```

Where `paymentMiddlewareDynamic` is a thin wrapper around the x402 middleware that reads `req.x402Config` for its price configuration.

### 3e. The One-Page Dashboard Layout

The dashboard is a single HTML page. Not a multi-page app. Not a router with routes. One URL, always live, always showing the current state. This is a monitoring dashboard, not a website.

**Layout overview** (three panels, all visible simultaneously):

```
╔══════════════════════════════════════════════════════════════════════════╗
║  THE $10 TABLE  ·  Hand #47  ·  $218.40 total USDC transacted  ·  LIVE  ║
╠════════════════════════════════════════════╦═════════════════════════════╣
║                                            ║                             ║
║             POKER TABLE                    ║      LIVE TX FEED           ║
║                (60% width)                 ║         (20% width)         ║
║                                            ║                             ║
║     ┌──────────┐    ┌──────────┐           ║  ✅ GPT → Pot            ║
║     │ [OpenAI] │    │[Anthropic]│          ║     $0.50 USDC              ║
║     │  GPT  │    │  Claude   │          ║     0x3a8f... ↗             ║
║     │  $12.40  │    │   $8.20   │          ║                             ║
║     │   🟢     │    │    ⚪     │          ║  ✅ Claude → Pot            ║
║     └──────────┘    └──────────┘           ║     $0.50 USDC              ║
║                                            ║     0x9c2b... ↗             ║
║          [ A♠  K♥  7♦ ] [  ] [  ]         ║                             ║
║                                            ║  ⏳ Gemini → Pot            ║
║     POT: $2.80 USDC                        ║     $0.75 USDC              ║
║                                            ║     settling...             ║
║     ┌──────────┐    ┌──────────┐           ║                             ║
║     │[Mistral] │    │[DeepSeek]│           ║  ✅ Pot → GPT           ║
║     │ Mistral  │    │ DeepSeek │           ║     $3.20 USDC              ║
║     │   $6.30  │    │   $9.10  │           ║     0x7f3a... ↗             ║
║     │    ⚪    │    │    ⚪    │           ║                             ║
║     └──────────┘    └──────────┘           ║  ✅ Mistral → Pot           ║
║                                            ║     $0.10 USDC              ║
║          ┌──────────┐                      ║     0x4d1b... ↗             ║
║          │  [xAI]   │                      ║                             ║
║          │   Grok   │                      ║                             ║
║          │   $3.00  │                      ║                             ║
║          │    💀    │                      ║                             ║
║          └──────────┘                      ║                             ║
╠════════════════════════════════════════════╩═════════════════════════════╣
║                                                                          ║
║   💭  AGENT THINKING                            (bottom 20%)            ║
║                                                                          ║
║  [GPT]  "Hand strength: Top Pair, Top Kicker (94th percentile).      ║
║   Equity: 71%. Pot odds: 2.8:1. Opponent raised 75% pot on flop —       ║
║   range is weighted toward draws. EV of call: +$0.32. Raising."         ║
║                                                                          ║
║  [Claude]  "I hold K♥ Q♠. The board paired the ace on the turn —        ║
║   my king-high is now drawing nearly dead. Pot odds: 1.8:1 against      ║
║   my 12% equity. The math is clear. Folding."                           ║
║                                                                          ║
║  [Gemini]  "Flush draw + overcards = 15 outs. ~33% equity. Pot offers   ║
║   2.1:1 which is just under the break-even threshold. But implied odds  ║
║   from remaining stacks justify the call. Calling."                     ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Panel breakdown:**

**Top bar (5% height)**: Game title, hand number, total USDC transacted since start, live indicator (pulsing green dot). This is the "headline" — a judge walking by sees `$218.40 total USDC transacted` and understands immediately that real value has moved.

**Poker Table panel (60% width, 75% height)**: An oval green felt table centered in the panel. Six agent seats positioned around the oval. Each seat contains:
- The model's brand logo PNG (see §7 for asset list)
- Model name below the logo
- Current USDC stack in bright green monospace type
- Status indicator: 🟢 actively thinking (animates while awaiting LLM response), ⚪ waiting for their turn, 💀 eliminated (seat dims, grayscale filter applied to logo)
- Their two hole cards (face-down during play, revealed face-up at showdown with a 3D flip animation)

Community cards are displayed in the center of the oval. Each card has a reveal animation: they flip face-down at the start of a hand, then flip face-up one at a time at flop/turn/river. The current pot amount sits beneath the community cards in large type.

The active player's seat has a subtle glow border and the status icon spins while the LLM API call is in flight. Once the response returns, the reasoning text streams into the thinking panel before the action is processed.

**Transaction Feed (20% width, 75% height)**: A scrolling list of x402 payment events. Each entry shows:
- Agent logo (small, 16px) and name
- Arrow direction (→ for bet, ← for receiving pot)
- Amount in USDC
- Status: ⏳ settling... or ✅ confirmed
- Truncated tx hash with a clickable Basescan link (opens in new tab)

New entries appear at the top with a brief slide-in animation. The feed scrolls automatically. There is no pagination — it's a live stream.

**Thinking Panel (100% width, 20% height)**: Three text blocks, one per currently-active reasoning thread. Each block has the model's logo + name on the left and the reasoning text on the right. Text streams character by character if you use streaming APIs (optional enhancement), or appears all at once after the LLM responds. The panel holds the last three reasoning outputs — older ones fade and shift up.

This panel is the killer feature. This is what no other poker implementation has. The audience can compare, in real time:
- GPT's crisp, mathematical reasoning
- Claude's careful logical chain
- Gemini's risk-weighted analysis
- Mistral's pattern-matching heuristics
- DeepSeek's calculation-heavy approach
- Grok's (possibly unhinged) reasoning

The thinking panel makes the benchmark legible. You're not just watching chip stacks move — you understand *why* each model made each decision.

**Visual design philosophy**: Dark background (near-black, `#0a0a0a`). Green felt for the poker table (`#1a4a2e`). Bright USDC amounts in green. White text for model names. Orange/amber for pot amounts. The Basescan links are blue. Brand logos are displayed at natural colors against the dark background. The overall aesthetic should feel like a Bloomberg terminal crossed with a late-night casino — serious, data-dense, but clearly alive.

### 3f. What Happens When It "Finishes"

**The normal flow**: Six agents start with $10 each ($60 total USDC in the system). Money is conserved — every dollar that leaves one agent's stack goes to another agent's stack (or sits in the pot temporarily). When an agent's stack hits $0, they are eliminated: their seat dims, their status shows 💀, their logo goes to grayscale, and the game continues with the remaining players.

**The tournament concludes** when one agent holds all $60 of the starting funds. This typically takes 100-200 hands of Texas Hold'em. At 15-20 seconds per hand (including LLM API latency), that's 25-65 minutes of runtime.

**For a 3-minute demo, this doesn't matter**. You don't need to finish the tournament. You show it running. The visual is self-explanatory: stacks at different levels, the thinking panel showing real reasoning, the transaction feed scrolling with real on-chain payments. The question "who's winning so far?" is itself engaging — you point to the leaderboard.

**If it does finish during your demo window** — that's a natural climax. The winner's logo pulses, confetti CSS animation fires, a final leaderboard appears. Build this endpoint: it takes 30 minutes to implement and creates a memorable wow moment if you get lucky with timing.

**After tournament end**: The dashboard shows final stats:
```
TOURNAMENT COMPLETE — 127 hands played
Winner: Claude ($60.00 USDC)
GPT: $0.00 (eliminated hand #89)
Gemini: $0.00 (eliminated hand #112)
Total USDC transacted: $847.20
Total tx count: 1,283 on-chain payments
Restart? [NEW TOURNAMENT]
```

**Restartability**: The `[NEW TOURNAMENT]` button resets all agent stacks to $10 (funds from a reserve wallet) and starts a fresh tournament. For a hackathon demo where judges return multiple times, this matters.

---

## 4. The Prompt (Identical for All LLMs)

This is the complete prompt. Every model receives this verbatim. The experiment is controlled on the prompt axis — any difference in outcomes is attributable to model capability, not prompt engineering.

### System Prompt

```
You are a poker agent competing in a no-limit Texas Hold'em tournament against other AI agents. Your goal is to maximize your chip stack over the course of the tournament.

GAME CONTEXT:
- You are playing with real USDC on Base Sepolia testnet
- Every bet you make is an actual on-chain payment
- You are competing against other AI models with identical instructions

DECISION MAKING:
You will receive structured game state with pre-computed values. You do not need to calculate hand strength or pot odds — these are provided to you. Your job is to make the strategic decision: fold, check, call, or raise.

Use the following factors in your reasoning:
1. Hand strength relative to all possible hands (percentile provided)
2. Equity (your probability of winning at showdown, provided)
3. Pot odds (ratio of call cost to pot size, provided)
4. Position (earlier position requires stronger hands)
5. Opponent betting patterns this round (action history provided)
6. Stack sizes (yours and the pot) relative to starting stacks
7. Bluffing when equity is low but fold equity is high

BLUFFING:
You may bluff. Bluffing is rational when:
- Your equity is low (< 20%)
- The pot odds you're offering opponents make calling unprofitable
- Your position and action history suggest fold equity exists

DECISION RULES:
- If equity > pot_odds_breakeven: calling has positive expected value
- If you raise, size between min_raise and max_raise
- Fold when the math is clearly negative and no bluff equity exists

OUTPUT FORMAT (strict JSON, no other text):
{
  "action": "fold" | "check" | "call" | "raise",
  "amount": <number if raising, null otherwise>,
  "reasoning": "<your reasoning in 1-3 sentences, shown publicly>"
}

The reasoning field will be displayed live on a public dashboard. Be concise but show your logic. Your reasoning is part of the performance.
```

### Per-Turn User Message Template

```
Hand #{{hand_number}} | Phase: {{phase}}
Your cards: {{hole_cards}}
Community: {{community_cards}}

Your stack: ${{stack}} USDC
Pot: ${{pot}} USDC
Hand strength: {{hand_rank}} ({{hand_percentile}}th percentile)
Equity: {{equity}}% (vs. {{active_players}} active opponents)
To call: ${{call_amount}}
Min raise: ${{min_raise}} | Max raise: ${{max_raise}}
Pot odds: {{pot_odds_ratio}} (break-even equity: {{pot_odds_breakeven}}%)
Position: {{position}} — {{seats_from_dealer}} seat(s) from dealer
Actions this round: {{action_history}}

Your action?
```

**Example populated template** (what GPT actually sees):

```
Hand #47 | Phase: Flop
Your cards: A♠ K♥
Community: A♦ 7♣ 2♥

Your stack: $12.40 USDC
Pot: $1.40 USDC
Hand strength: Top Pair, Top Kicker (94th percentile)
Equity: 71% (vs. 3 active opponents)
To call: $0.50
Min raise: $1.00 | Max raise: $12.40 (all-in)
Pot odds: 2.8:1 (break-even equity: 26%)
Position: Button — 1 seat from dealer
Actions this round: Gemini bet $0.50, Mistral folded

Your action?
```

**Why this template works**:

Every number the LLM needs is pre-computed. "Break-even equity: 26%" tells the model exactly what equity threshold makes a call profitable — it doesn't need to compute `call / (pot + call)`. "94th percentile" contextualizes hand strength without requiring the model to enumerate possible hands. The action history gives context without requiring the model to reconstruct bet sizing from raw chip counts. The model's job is genuinely strategic, not arithmetic.

---

## 5. How the Pieces Connect (Step-by-Step Flow)

This is a complete walk-through of a single hand from deal to payout, showing what happens at every layer simultaneously.

### Step 1: New Hand Initialization (game server, ~1ms)

```
GameEngine.startHand() executes:
  ├─ Rotate dealer button (track dealer index)
  ├─ Deduct small blind ($0.05) from seat 1 — adds to pot
  ├─ Deduct big blind ($0.10) from seat 2 — adds to pot
  ├─ Shuffle deck (Fisher-Yates, seeded from current timestamp)
  └─ Deal 2 hole cards to each active player (face down)

x402 fires for blinds:
  ├─ Each blind payment triggers POST /game/action with action="blind"
  ├─ x402 middleware intercepts, charges the blind amount from the agent's wallet
  └─ tx hashes returned and stored in hand history
```

### Step 2: Pre-Flop Hand Evaluation (server, ~5ms)

```
For each active player:
  ├─ pokersolver computes pre-flop hand category (high card, pair, etc.)
  ├─ Pre-computed equity lookup table gives starting hand equity
  │   (168 distinct starting hand categories × 6 player count)
  └─ HandResult stored in player state (not yet sent to frontend — hole cards private)
```

### Step 3: LLM Agent Decision (server → LLM API, 1-8 seconds)

```
For the active player (e.g., GPT):
  ├─ Server builds the per-turn prompt from the template
  ├─ Calls OpenAI API: POST https://api.openai.com/v1/chat/completions
  │   Model: gpt, max_tokens: 200, temperature: 0.7
  ├─ Sets 8-second timeout
  ├─ On response: parses JSON from the content field
  │   If parsing fails → action defaults to "fold", reasoning: "[INVALID RESPONSE → fold]"
  │   If timeout → action defaults to "fold", reasoning: "[TIMEOUT → fold]"
  └─ Extracted: { action: "raise", amount: 0.75, reasoning: "..." }
```

### Step 4: x402 Payment (server, ~200-400ms)

```
If action is "fold" or "check": no payment — game state updates immediately
If action is "call" or "raise":
  ├─ GPT's wrapFetchWithPayment instance makes:
  │   POST http://localhost:8000/game/action
  │   Body: { action: "raise", amount: 0.75, agentId: "gpt" }
  ├─ x402 middleware intercepts:
  │   Returns 402 with PAYMENT-REQUIRED header
  │   Price: "$0.75", payTo: POT_WALLET_ADDRESS, network: "eip155:84532"
  ├─ wrapFetchWithPayment reads the 402:
  │   ExactEvmScheme signs the EIP-3009 USDC transfer authorization
  │   Attaches PAYMENT-SIGNATURE header
  │   Retries the request
  ├─ x402 middleware forwards to x402.org/facilitator:
  │   Facilitator verifies signature
  │   Submits USDC transfer on Base Sepolia
  │   Returns tx hash
  ├─ Middleware confirms payment, sets req.paymentTxHash
  └─ Request passes to route handler
```

### Step 5: Game State Update (server, ~1ms)

```
Route handler executes:
  ├─ GameEngine.applyAction(agentId, action, amount)
  │   ├─ Deducts amount from agent stack
  │   ├─ Adds amount to pot
  │   ├─ Records action in hand history
  │   └─ Advances to next player or next phase
  └─ Returns updated GameState object
```

### Step 6: WebSocket Broadcast (server → all clients, <1ms)

```
wss.broadcast({
  type: "action",
  agentId: "gpt",
  action: "raise",
  amount: 0.75,
  reasoning: "Top pair with nut flush draw. Equity 71%. Pot odds favor raise.",
  txHash: "0x3a8f...",
  gameState: {
    hand: 47,
    phase: "flop",
    pot: 2.15,
    stacks: { "gpt": 11.65, "claude": 8.20, ... },
    communityCards: ["As", "7c", "2h"],
    activePlayer: "claude"
  }
})
```

### Step 7: Dashboard Update (browser, ~16ms — one animation frame)

```
React state updates:
  ├─ PokerTable re-renders with new stacks (smooth count-up animation)
  ├─ GPT's seat shows new amount: $11.65
  ├─ Pot display flashes and updates: $2.15
  ├─ TransactionFeed prepends new entry:
  │   ✅ GPT → Pot  $0.75  0x3a8f... ↗
  ├─ ThinkingPanel updates GPT's reasoning text
  └─ Claude's seat glows: status icon spins (awaiting LLM response)
```

### Step 8: Showdown and Pot Distribution (server, ~10ms)

```
When all betting rounds complete:
  ├─ Each active player's best 5-card hand evaluated via pokersolver
  ├─ Hands ranked — winner determined
  ├─ Side pots calculated if any all-ins occurred
  └─ For each pot allocation:
      ├─ POST /game/action with action="payout" fires
      ├─ x402 middleware charges POT_WALLET for the payout amount
      │   (direction: pot → winner, reversed from normal bet direction)
      ├─ Payment settles on-chain
      └─ Winner stack increases by pot amount

WebSocket broadcast:
  type: "showdown"
  hands: { "gpt": { cards: ["As","Kh"], rank: "Top Pair" }, ... }
  winner: "gpt"
  amount: 2.15
  txHash: "0x..."

Dashboard: cards flip face-up (3D CSS animation), winner seat pulses.
```

### Step 9: Next Hand (repeat from Step 1, after 2-second delay)

The `HAND_DELAY_MS=2000` config gives the audience time to read the showdown result before the next hand begins.

---

## 6. Environment Variables

Every environment variable with exactly where to obtain it:

```env
# ─────────────────────────────────────────────
# LLM APIs — all models receive the identical prompt
# ─────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...

OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-...
GPT_MODEL=openai/gpt-oss-120b

CLAUDE_BASE_URL=https://openrouter.ai/api/v1
CLAUDE_API_KEY=sk-or-...
CLAUDE_MODEL=anthropic/claude-haiku-4.5

GROK_BASE_URL=https://openrouter.ai/api/v1
XAI_API_KEY=sk-or-...
GROK_MODEL=x-ai/grok-4.1-fast

MISTRAL_BASE_URL=https://openrouter.ai/api/v1
MISTRAL_API_KEY=sk-or-...
MISTRAL_MODEL=mistralai/mistral-small-3.1-24b-instruct:free # default

DEEPSEEK_BASE_URL=https://openrouter.ai/api/v1
DEEPSEEK_API_KEY=sk-or-...
DEEPSEEK_MODEL=deepseek/deepseek-v3.2

GEMINI_BASE_URL=https://openrouter.ai/api/v1
GEMINI_API_KEY=sk-or-...
GEMINI_MODEL=google/gemini-2.5-flash

# ─────────────────────────────────────────────
# OWS (Open Wallet Standard)
# ─────────────────────────────────────────────
OWS_VAULT_PATH=~/.ows     # Default path set during install
                          # Install: curl -fsSL https://docs.openwallet.sh/install.sh | bash

# ─────────────────────────────────────────────
# x402 Protocol
# ─────────────────────────────────────────────
X402_FACILITATOR_URL=https://x402.org/facilitator
                          # No API key required for Base Sepolia testnet

# ─────────────────────────────────────────────
# Agent Wallets — generated by `ows wallet create`
# After running scripts/create-wallets.sh, fill these in
# ─────────────────────────────────────────────
GROK_WALLET_ADDRESS=0x...
GROK_PRIVATE_KEY=0x...    # Export from OWS: ows wallet export --wallet grok

GPT_WALLET_ADDRESS=0x...
GPT_PRIVATE_KEY=0x...    # ows wallet export --wallet gpt

GEMINI_WALLET_ADDRESS=0x...
GEMINI_PRIVATE_KEY=0x...

CLAUDE_WALLET_ADDRESS=0x...
CLAUDE_PRIVATE_KEY=0x...

MISTRAL_WALLET_ADDRESS=0x...
MISTRAL_PRIVATE_KEY=0x...

DEEPSEEK_WALLET_ADDRESS=0x...
DEEPSEEK_PRIVATE_KEY=0x...

POT_WALLET_ADDRESS=0x...
POT_PRIVATE_KEY=0x...      # The pot wallet signs outbound payments (pot → winner)

# ─────────────────────────────────────────────
# Game Configuration
# ─────────────────────────────────────────────
STARTING_STACK=10.00       # USDC per agent at tournament start
SMALL_BLIND=0.05           # Small blind amount in USDC
BIG_BLIND=0.10             # Big blind amount in USDC
HAND_DELAY_MS=2000         # Pause between hands (ms) — gives audience time to read results
LLM_TIMEOUT_MS=8000        # Max wait for LLM API response before defaulting to fold
MONTE_CARLO_SIMS=500       # Equity calculation simulations — 500 runs takes ~3ms in Node.js

# ─────────────────────────────────────────────
# Server
# ─────────────────────────────────────────────
PORT=8000
VITE_WS_URL=ws://localhost:8000/ws   # Dashboard WebSocket connection

# ─────────────────────────────────────────────
# Optional: Faucet (Base Sepolia USDC)
# ─────────────────────────────────────────────
# No env var needed — fund wallets manually:
# https://faucet.circle.com (Circle testnet USDC faucet, Base Sepolia)
# Or: https://app.aave.com/faucet (alternative)
```

---

## 7. Folder & File Structure

```
the-ten-dollar-table/
│
├── README.md
│     Quick-start instructions for anyone cloning the repo. Leads with
│     the one-command setup, then explains what the project does.
│
├── .env.example
│     Copy of §6 with placeholder values. `cp .env.example .env` is
│     the first command in setup.sh.
│
├── package.json
│     Root workspace package. Scripts: `start` (runs server + dashboard
│     concurrently), `setup` (delegates to setup.sh).
│
├── setup.sh
│     One-command bootstrap: installs deps, creates OWS wallets,
│     prompts user to fund wallets, verifies balances, copies .env.example.
│
├── server/
│   ├── package.json
│   │     Dependencies: express, ws, @x402/express, @x402/fetch,
│   │     @x402/core, @x402/evm, viem, pokersolver, openai,
│   │     @anthropic-ai/sdk, axios, dotenv, typescript, tsx.
│   │
│   ├── tsconfig.json
│   │     Standard Node.js TypeScript config. Target: ES2022, module: NodeNext.
│   │
│   └── src/
│       ├── index.ts
│       │     Entry point. Creates Express app, attaches paymentMiddleware,
│       │     creates WebSocket server, starts the main game loop.
│       │     Exports the wss instance for broadcasting.
│       │
│       ├── poker-engine.ts
│       │     All game logic: deck, hand dealing, blind rotation, bet
│       │     processing, pot management, side pot calculation, showdown
│       │     resolution. Uses pokersolver for hand ranking.
│       │     No x402 or LLM logic here — pure poker mechanics.
│       │
│       ├── hand-eval.ts
│       │     Hand evaluation and equity calculation. Wraps pokersolver
│       │     for hand ranking. Implements Monte Carlo equity simulation
│       │     (runs 500 random board runouts and computes win rate).
│       │     Exports: evaluateHand(), computeEquity(), handPercentile().
│       │
│       ├── llm-agent.ts
│       │     Single exported function: getAgentAction(agentId, gameState).
│       │     Builds the per-turn prompt from the template in §4.
│       │     Routes to the correct LLM provider via MODEL_CONFIGS.
│       │     Parses JSON response with fallback-to-fold on any error.
│       │     Enforces the 8-second timeout via Promise.race.
│       │
│       ├── x402-setup.ts
│       │     Initializes one wrapFetchWithPayment client per agent.
│       │     Reads private keys from .env, creates viem accounts via
│       │     privateKeyToAccount, registers ExactEvmScheme on eip155:84532.
│       │     Exports: agentFetch(agentId) → the payment-wrapped fetch.
│       │
│       ├── wallet-manager.ts
│       │     Loads wallet addresses from .env. Provides helpers:
│       │     getAddress(agentId), getPotAddress(). Does not touch private
│       │     keys — those are in x402-setup.ts. Exports the address map.
│       │
│       ├── game-state.ts
│       │     The central in-memory game state store. Holds current hand,
│       │     stacks, pot, phase, action history, and hand count.
│       │     Provides broadcast() which serializes state and sends via wss.
│       │     All game state mutations go through this module.
│       │
│       └── config.ts
│             Loads and validates all environment variables at startup.
│             Exports typed config object. Crashes with a clear error
│             message if any required variable is missing.
│
├── dashboard/
│   ├── package.json
│   │     Dependencies: react, react-dom, vite, @vitejs/plugin-react,
│   │     tailwindcss, autoprefixer.
│   │
│   ├── tailwind.config.js
│   │     Custom theme: near-black background, green felt color,
│   │     amber pot color, monospace font for USDC amounts.
│   │
│   └── src/
│       ├── App.tsx
│       │     Single page component. Three-panel layout using CSS Grid:
│       │     60% left (table + feed), 20% right (tx feed), 20% bottom
│       │     (thinking panel). Mounts useGameSocket and distributes
│       │     game state to child components.
│       │
│       ├── types.ts
│       │     TypeScript interfaces for GameState, AgentState, TxEntry,
│       │     ThinkingEntry. Single source of truth for frontend data shapes.
│       │
│       ├── hooks/
│       │   └── useGameSocket.ts
│       │         WebSocket hook. Connects to VITE_WS_URL on mount.
│       │         Parses incoming messages, updates React state via useReducer.
│       │         Handles reconnection with exponential backoff.
│       │         Returns: { gameState, transactions, thinking, connectionStatus }.
│       │
│       ├── components/
│       │   ├── PokerTable.tsx
│       │   │     Renders the oval green felt table. Uses CSS clip-path:
│       │   │     ellipse for the felt shape. Positions 6 AgentSeat
│       │   │     components around the oval using pre-computed angles.
│       │   │     CommunityCards are centered inside the oval.
│       │   │
│       │   ├── AgentSeat.tsx
│       │   │     Single agent seat: logo PNG + model name + USDC stack
│       │   │     + status icon + 2 hole cards. Status: spinning green
│       │   │     circle while thinking, white circle while waiting,
│       │   │     skull emoji with grayscale filter when eliminated.
│       │   │     Stack amount uses countUp animation from prev to new value.
│       │   │
│       │   ├── CommunityCards.tsx
│       │   │     Five card slots in a row. Cards are rendered face-down
│       │   │     at hand start and flip face-up (CSS 3D transform
│       │   │     perspective + rotateY) when revealed at flop/turn/river.
│       │   │
│       │   ├── PotDisplay.tsx
│       │   │     Current pot amount in large amber monospace type.
│       │   │     Briefly pulses/scales up when the pot value increases.
│       │   │
│       │   ├── TransactionFeed.tsx
│       │   │     Scrolling list of TxEntry items. Each entry: agent mini-
│       │   │     logo, direction arrow, amount, status icon, truncated
│       │   │     tx hash as a Basescan link. New entries slide in from
│       │   │     the top. Maximum 50 entries visible.
│       │   │
│       │   ├── ThinkingPanel.tsx
│       │   │     Displays the last 3 agent reasoning entries. Each entry:
│       │   │     agent logo + name on the left, reasoning text on the right.
│       │   │     Older entries fade out as new ones arrive. This component
│       │   │     is the entertainment centerpiece of the dashboard.
│       │   │
│       │   └── StatsBar.tsx
│       │         Top bar: title, hand number, total USDC transacted, live
│       │         indicator. Total transacted is a running sum of all bet
│       │         amounts since tournament start — a compelling "weight" metric.
│       │
│       └── assets/
│           ├── openai.png      # OpenAI logo (white on transparent)
│           ├── anthropic.png   # Anthropic logo
│           ├── google.png      # Google logo (for Gemini)
│           ├── mistral.png     # Mistral logo
│           ├── deepseek.png    # DeepSeek logo
│           └── xai.png         # xAI logo (for Grok)
│
└── scripts/
    ├── create-wallets.sh
    │     Creates all 7 OWS wallets and prints their EVM addresses.
    │     Exports private keys to .env format for copy-paste.
    │
    ├── fund-wallets.sh
    │     Prints each wallet address with instructions for the Base Sepolia
    │     USDC faucet (https://faucet.circle.com). Opens Basescan links.
    │
    └── check-balances.sh
          Calls `ows fund balance --wallet <name>` for all 7 wallets.
          Verifies each has >= $10 USDC before allowing game start.
```

---

## 8. Bootstrap Commands

Complete setup from zero. Every command in order.

### Phase 0: Prerequisites

```bash
# Install OWS
curl -fsSL https://docs.openwallet.sh/install.sh | bash
source ~/.bashrc  # or restart your terminal

# Verify
ows --version

# Install Node.js 22+ (if not already installed)
# https://nodejs.org or via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
node --version  # should print v22.x.x
```

### Phase 1: Clone and Install

```bash
# Clone the repo (or create fresh)
git clone https://github.com/yourhandle/the-ten-dollar-table
cd the-ten-dollar-table

# Install all dependencies (root + server + dashboard)
npm install
cd server && npm install && cd ..
cd dashboard && npm install && cd ..
```

### Phase 2: OWS Wallets

```bash
# Create all 7 wallets (six agents + pot)
ows wallet create --name "grok"
ows wallet create --name "gpt"
ows wallet create --name "gemini"
ows wallet create --name "claude"
ows wallet create --name "mistral"
ows wallet create --name "deepseek"
ows wallet create --name "pot"

# List all wallets and their EVM addresses
ows wallet list
# Copy each EVM address — you'll need these for .env

# Export private keys for x402 viem signing
# (testnet only — see §3b for why this is acceptable)
ows wallet export --wallet grok
ows wallet export --wallet gpt
ows wallet export --wallet gemini
ows wallet export --wallet claude
ows wallet export --wallet mistral
ows wallet export --wallet deepseek
ows wallet export --wallet pot
# Copy each private key — paste into .env file
```

### Phase 3: Fund Wallets

```bash
# Open the Base Sepolia USDC faucet
open https://faucet.circle.com

# Fund each of the 6 agent wallets with $10 USDC
# The pot wallet starts at $0 — it collects bets, then distributes winnings

# After funding, verify balances
ows fund balance --wallet grok
ows fund balance --wallet gpt
ows fund balance --wallet gemini
ows fund balance --wallet claude
ows fund balance --wallet mistral
ows fund balance --wallet deepseek
# Each should show >= 10.00 USDC on Base Sepolia (chain: eip155:84532)
```

### Phase 4: Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Open and fill in all values
# Required: all 6 LLM API keys, all 7 wallet addresses + private keys
# Verify: double-check POT_WALLET_ADDRESS matches the pot wallet's EVM address
nano .env  # or vim/code/whatever
```

### Phase 5: First Run

```bash
# Terminal 1: Start the game server
cd server
npm run dev
# Should print:
# x402 middleware registered on POST /game/action
# WebSocket server listening on ws://localhost:8000/ws
# Game server ready on http://localhost:8000

# Terminal 2: Start the dashboard
cd dashboard
npm run dev
# Should print:
# VITE v5.x ready in 300ms
# → Local: http://localhost:5173

# Open browser: http://localhost:5173
# The dashboard should show 6 agent seats with $10.00 each

# Terminal 3: Start a game
curl -X POST http://localhost:8000/game/start
# Game begins. Watch the dashboard update in real time.
```

### Phase 6: Verify End-to-End

```bash
# Watch the transaction feed on the dashboard
# Each action should show a tx hash — click it to verify on Basescan:
open https://sepolia.basescan.org

# Search for the tx hash — you should see a USDC transfer
# from the agent wallet address to the pot wallet address.
# This is your proof of integration.
```

### Quick Recovery Commands

```bash
# If server crashes mid-game:
curl -X POST http://localhost:8000/game/reset
curl -X POST http://localhost:8000/game/start

# If a wallet runs low (happens in testing):
# Go back to faucet.circle.com and refund the wallet

# If an LLM API key fails:
# The agent defaults to fold — game continues. Fix the key and restart.
```

---

## 9. The Showstopper Moment

Picture this: you're three minutes into your demo. You've explained nothing. You opened a browser tab and said "here's what we built."

The dashboard is showing Hand #31. Six AI logos around a green poker table. Claude's stack is at $14.20 — it's been running hot. GPT is at $9.80, slightly down. Gemini is at $11.40. Mistral, DeepSeek, and Grok are all between $7 and $12. The game is genuinely competitive.

Then GPT gets dealt pocket aces.

Its thinking indicator glows green and spins for 1.2 seconds while the OpenAI API processes. The audience is watching the thinking panel. Then GPT's reasoning streams in:

> "Pocket aces pre-flop — 85th percentile equity heads-up, decreasing to 72% vs. 5 opponents. Pre-flop raise to charge equity. Raising to $0.30."

The `POST /game/action` fires. The x402 middleware intercepts. Three hundred milliseconds later: `✅ GPT → Pot  $0.30  0x7f3a...`. The transaction is there. On-chain. Real. You can click the link and see it on Basescan right now, mid-demo.

Claude calls. Gemini raises to $0.90. The pot swells to $1.80.

The thinking panel updates with Claude's reasoning:

> "Pocket tens. Strong pre-flop equity (62%). GPT raised small — suggest strong hand. Gemini re-raised — range narrows. Pot odds 3.1:1, need 24% equity to call. I have more than that. Calling."

And Gemini's:

> "Ace-King suited. 65% equity against typical raising range. Three-betting to $0.90 to define the field and charge draws. If GPT 4-bets, reassess."

The audience can read three different models thinking through the same situation simultaneously. They're comparing. They have opinions. "Wait — Claude's math is wrong." "No, it's accounting for the implied odds." "GPT is being too passive with aces." This is the entertainment. You haven't explained anything. The screen is doing all the work.

The flop comes: `A♦  K♣  7♥`. GPT has top set. The thinking panel:

> "Top set. Equity: 94%. Pot: $2.70. I will bet $2.00 to charge flush draws and protect against straights."

The `$2.00` USDC payment fires. `✅ GPT → Pot  $2.00  0x3a8f...`. The transaction feed shows the payment settling in real time. Basescan link is clickable.

Claude folds. Gemini calls with its two-pair draw.

The turn: `2♣`. River: `8♣`. Gemini paired nothing extra. GPT wins the pot. `$6.70 USDC → GPT`. The pot wallet signs the payout. On-chain, instantly.

GPT's stack: `$16.50`. Gemini's stack: `$8.40`.

That is the moment. Not staged. Not faked. Every number on screen is a real USDC balance. Every transaction in the feed is a real on-chain settlement. Every reasoning text is GPT's and Gemini's and Claude's actual chain of thought from this very hand, right now. The judge didn't see a demo. They watched a live event.

---

## 10. 3-Minute Demo Script

The hook you open with, said while the dashboard is already visible on screen:

> "Which AI is the best poker player? We gave them all the same cards, the same rules, the same prompt — word for word, identical — and real money. Let's find out."

**Minute 1 — Orient the audience:**

Point to the poker table. "Six foundation models. Each starts with $10 USDC on Base Sepolia. Every bet they make is a real on-chain payment — you can see the transaction hashes here." Point to the feed. "And here's the part that makes this different from every other AI poker project: you can read their actual reasoning." Point to the thinking panel. "This isn't post-hoc narration. This is the literal output of each model's API call, displayed live as they decide."

**Minute 2 — Let it run:**

Don't narrate every action. Let the thinking panel do the work. If a model makes an interesting play, point it out: "GPT just check-raised. Here's its reasoning — pure equity math. Claude called even though it's behind. Here's why Claude thinks it has implied odds." Let the audience read. Point out the transaction feed: "Every one of those tick marks is a settled USDC transfer on Base Sepolia. $X USDC has changed hands in the time we've been talking."

**Minute 3 — The technical punch:**

"Here's the key architectural insight: there is no separate payment system bolted onto the game. When GPT bets, its x402 client makes an HTTP request. The server returns a 402 Payment Required. The agent's OWS wallet signs the USDC transfer authorization. The payment settles via x402.org's facilitator. The server returns 200 OK — and only then does the game logic process the bet. The HTTP protocol itself enforces that you can't bluff without paying. The game logic and the payment logic are the same protocol."

Then, if you have time: "The benchmark is still running. [Model X] is ahead right now with $Y. We'll see who wins."

---

## 11. Five Failure Points & Quick Fixes

### Failure 1: LLM API rate limit or timeout

**Symptom**: One agent's seat shows "thinking" for more than 8 seconds. Dashboard freezes or shows `[TIMEOUT → fold]` repeatedly for one seat.

**Why it happens**: LLM APIs under load, especially at a hackathon where multiple teams may be hitting the same endpoints.

**Quick fix**: The `LLM_TIMEOUT_MS=8000` guard forces a fold after 8 seconds — the game continues. To fix the root cause: (a) reduce `max_tokens` from 200 to 100, (b) switch the problematic model to a faster variant (e.g., a smaller GPT variant, `claude-haiku-4-5` instead of `claude-opus-4-5`), (c) if a key is rate-limited, retry with backoff or swap model. None of these require server restart — update `.env` and `pkill -f tsx` then rerun.

**Backstop**: If one model completely fails, comment out that agent in `config.ts` and run with 5 agents. The game still demonstrates the benchmark with real payments.

### Failure 2: x402 payment fails or facilitator is unreachable

**Symptom**: Actions hang at the "settling" state in the tx feed. Basescan shows no transaction. Server logs show facilitator errors.

**Why it happens**: x402.org/facilitator is a public endpoint that may be rate-limited or temporarily unavailable. Network connectivity issues at the hackathon venue.

**Quick fix**: The x402 facilitator is configured via `X402_FACILITATOR_URL`. If x402.org is down, check if there's an alternative facilitator running. The x402 protocol is open — any compliant facilitator works. For emergency: implement a `MOCK_PAYMENTS=true` environment flag that bypasses the actual x402 payment and fakes the tx hash (the game logic continues, the payments are fake, but the demo can proceed).

**Backstop**: Have a pre-recorded video of the dashboard running with real payments. If live payments fail during the demo, play the backup video while explaining the architecture. Judges care about the architecture more than the live demo.

### Failure 3: OWS wallet / private key issues

**Symptom**: Server fails to start. Error: "Could not load private key for agent gpt" or viem throws on account creation.

**Why it happens**: Private key export from OWS produced unexpected format, or `.env` values were pasted incorrectly (missing `0x` prefix, or wrong wallet mapped to wrong key).

**Quick fix**: Re-run `ows wallet export --wallet gpt` and verify the key starts with `0x`. Paste raw into `.env`. Verify with a quick Node.js snippet: `node -e "const {privateKeyToAccount} = require('viem/accounts'); console.log(privateKeyToAccount('${KEY}').address)"` — it should print the correct wallet address.

**Backstop**: Generate fresh EVM wallets directly with viem (no OWS needed) using `generatePrivateKey()` from `viem/accounts`. Fund those wallets from the faucet. This bypasses OWS entirely — mention it to judges as "we ran into OWS key format issues but here's how we'd integrate properly in production."

### Failure 4: USDC balance too low mid-game

**Symptom**: An agent tries to bet more than its stack. The game server throws an error. Or, worse, an x402 payment fails because the agent wallet has insufficient USDC.

**Why it happens**: Testing consumed testnet USDC before the demo. Or the faucet only gave partial amounts.

**Quick fix**: The game server should enforce stack bounds — an agent cannot bet more than its in-game stack, regardless of what's in its on-chain wallet. This is standard poker: you can only play what's in front of you. Implement this guard in `poker-engine.ts`. If the on-chain balance is lower than the in-game stack, the x402 payment will fail, but this should be a recoverable error (substitute fold).

**Pre-demo check**: Run `scripts/check-balances.sh` 30 minutes before your demo. Each wallet should have at minimum $15 USDC (buffer for testing losses). Top up as needed from the faucet.

### Failure 5: Dashboard WebSocket disconnects

**Symptom**: The dashboard shows stale state. Chip stacks stop updating. The game is still running on the server but the browser is frozen.

**Why it happens**: WebSocket connection dropped due to network switch, browser tab backgrounding, or server restart.

**Quick fix**: The `useGameSocket.ts` hook implements automatic reconnection with exponential backoff (starting at 1 second, up to 30 seconds). A disconnected state should show a "Reconnecting..." indicator and recover automatically within a few seconds.

**Pre-demo action**: Open the dashboard in a dedicated browser window (not a tab). Keep it in focus. Disable browser tab throttling: in Chrome, go to `chrome://flags`, search "Throttle", and disable "Throttle non-visible cross-origin iframes." Or: run the dashboard on a separate machine/TV that never leaves focus.

---

## 12. Hour-by-Hour Build Plan

| Hour | Tasks | Priority | Done? |
|------|-------|----------|-------|
| **0–1** | Install OWS. Create 7 wallets. Export private keys. Verify addresses. Fund wallets from Circle faucet. Verify balances. Copy `.env.example` → `.env`. | 🔴 CRITICAL |  |
| **1–2** | Initialize Node.js server project. Install all dependencies. Set up Express with basic health-check route. Implement `config.ts` with env validation. Get server running with `tsx --watch`. | 🔴 CRITICAL | |
| **2–3** | Implement `x402-setup.ts`: create one `wrapFetchWithPayment` instance per agent. Implement `paymentMiddleware` on `POST /game/action` with dynamic pricing. Test: POST to the endpoint from curl, verify 402 response. Then test with payment — verify tx hash returns in 200 response. | 🔴 CRITICAL | |
| **3–4** | Implement `poker-engine.ts`: deck, deal, blinds, betting round logic, showdown. Implement `hand-eval.ts`: pokersolver integration, Monte Carlo equity. Test the engine standalone with a simulated 2-player game. | 🔴 CRITICAL | |
| **4–5** | Implement `llm-agent.ts`: one function, routes to 6 model endpoints, parses JSON, falls back to fold. Test with real API calls — verify each model returns valid JSON. Fix any model-specific response format quirks. | 🔴 CRITICAL | |
| **5–6** | Implement `game-state.ts` and `index.ts` main game loop. Wire game engine → LLM agent → x402 payment → game state update → WebSocket broadcast. First complete end-to-end hand: deal → all 6 agents decide → payments fire → winner receives pot. | 🔴 CRITICAL | |
| **6–7** | Initialize React dashboard project (Vite). Implement `useGameSocket.ts`. Build `App.tsx` with three-panel CSS Grid layout. Implement `StatsBar.tsx` and `TransactionFeed.tsx` first — these are the fastest to build and provide immediate visual feedback. | 🔴 CRITICAL | |
| **7–8** | Implement `PokerTable.tsx` with oval CSS layout. Implement `AgentSeat.tsx`: logo, stack, status icon. Implement `CommunityCards.tsx` with face-down/face-up states. Implement `PotDisplay.tsx`. | 🔴 CRITICAL | |
| **8–9** | Implement `ThinkingPanel.tsx` — the killer feature. Test: start a real game, watch the thinking panel populate with actual LLM reasoning. Fix timing: reasoning should appear in the panel BEFORE the action is processed (so the audience sees the thought first, then the action). | 🔴 CRITICAL | |
| **9–10** | Polish the WebSocket message types. Add stack count-up animation. Add card flip animation. Add active-player seat glow. Test 10 complete hands end-to-end. Fix edge cases: fold handling, all-in side pots, disconnection recovery. | 🟡 HIGH | |
| **10–11** | Stress test: run 20 hands without interruption. Monitor for API timeout handling, payment failure recovery, memory leaks (WebSocket client list growing). Test reconnection: close the browser, reopen, verify it reconnects and syncs current state. | 🟡 HIGH | |
| **11–12** | Record a 3-minute backup video of the dashboard running with payments. Write the README one-paragraph pitch. Prepare the demo script mentally. Polish any visual glitches. Add `[NEW TOURNAMENT]` restart button. | 🟢 NICE | |

**Critical path**: Hours 0–9 are load-bearing. If any critical step takes longer than planned, drop the polish items from hours 9–12 first, then drop the thinking panel animations (keep the text), then drop the card animations. The minimum viable demo is: live game running, stacks updating, tx feed showing real hashes, reasoning text visible. Everything else is enhancement.

**Parallelization option**: If you have a co-builder, split at hour 6: one person continues wiring the backend game loop while the other starts the React frontend. They converge at hour 9 when the WebSocket integration happens. With two builders, you can realistically get to a polished state by hour 10, leaving two full hours for testing.

---

*Last updated: April 3, 2026 — v2. All v1 content superseded by this document.*
