/**
 * ELO / Glicko-2 Rating System
 * Adapted from conference-arena (Glickman 2013)
 */

const K = 16;

export const INITIAL_ELO = 1500;
export const INITIAL_RD = 200;
export const INITIAL_VOLATILITY = 0.06;

/** Basic ELO calculation (fallback) */
export function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  scoreB: number
): { newRatingA: number; newRatingB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

  const actualA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
  const actualB = scoreB > scoreA ? 1 : scoreB === scoreA ? 0.5 : 0;

  const newRatingA = Math.round(ratingA + K * (actualA - expectedA));
  const newRatingB = Math.round(ratingB + K * (actualB - expectedB));

  return { newRatingA, newRatingB };
}

// ---------------------------------------------------------------------------
// Glicko-2 — Glickman (2013) with extensions
// ---------------------------------------------------------------------------

export interface GlickoConfig {
  tau: number;
  initialRd: number;
  minRd: number;
  maxRd: number;
  initialVolatility: number;
  convergenceTolerance: number;
  maxVolatilityIterations: number;
  rdDecayPerDay: number;
}

export const DEFAULT_GLICKO_CONFIG: GlickoConfig = {
  tau: 0.5,
  initialRd: 200,
  minRd: 50,
  maxRd: 200,
  initialVolatility: 0.06,
  convergenceTolerance: 0.000001,
  maxVolatilityIterations: 100,
  rdDecayPerDay: 5 / 30,
};

export interface GlickoInput {
  rating: number;
  rd: number;
  volatility: number;
  lastMatchAt: number;
}

export interface GlickoResult {
  newRating: number;
  newRd: number;
  newVolatility: number;
  eloChange: number;
}

// Glicko-2 scale conversion
const GLICKO2_SCALE = 173.7178; // 400 / ln(10)

function toMu(rating: number): number {
  return (rating - 1500) / GLICKO2_SCALE;
}
function toPhi(rd: number): number {
  return rd / GLICKO2_SCALE;
}
function fromMu(mu: number): number {
  return mu * GLICKO2_SCALE + 1500;
}
function clampRd(rd: number, cfg: GlickoConfig): number {
  return Math.max(cfg.minRd, Math.min(cfg.maxRd, rd));
}

/** g(φ) — RD reduction factor */
function gFunc(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** E(μ, μ_j, φ_j) — expected outcome */
function expectedOutcome(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-gFunc(phiJ) * (mu - muJ)));
}

/** Compute new volatility σ' via Illinois algorithm (Glickman Step 5) */
function computeVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  cfg: GlickoConfig
): number {
  const { tau, convergenceTolerance: eps, maxVolatilityIterations: maxIter } = cfg;
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  function f(x: number): number {
    const ex = Math.exp(x);
    return (
      (ex * (deltaSq - phiSq - v - ex)) / (2 * (phiSq + v + ex) ** 2) -
      (x - a) / (tau * tau)
    );
  }

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < maxIter) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  for (let i = 0; i < maxIter && Math.abs(B - A) > eps; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

/** Decay RD over time */
export function decayRd(
  rd: number,
  daysSinceLastMatch: number,
  cfg: GlickoConfig = DEFAULT_GLICKO_CONFIG
): number {
  return Math.min(cfg.maxRd, rd + cfg.rdDecayPerDay * daysSinceLastMatch);
}

/**
 * Glicko-2 update for player vs "house" (prediction game).
 *
 * Player predicts outcome → game ends → score = accuracy (0 or 1).
 * House rating is fixed at 1500 / RD=200 / volatility=0.06.
 * accuracyFactor (0–1) scales the outcome to reward partial accuracy.
 */
export function updatePlayerRating(
  player: GlickoInput,
  won: boolean,
  accuracyFactor: number = 1.0,
  cfg: GlickoConfig = DEFAULT_GLICKO_CONFIG
): GlickoResult {
  const now = Date.now();
  const days = Math.max(0, (now - player.lastMatchAt) / 86_400_000);
  const rdDecayed = decayRd(player.rd, days, cfg);

  // House opponent — fixed at baseline
  const houseRating = 1500;
  const houseRd = 150;

  // Convert to Glicko-2 scale
  const mu = toMu(player.rating);
  const phi = toPhi(rdDecayed);
  const muH = toMu(houseRating);
  const phiH = toPhi(houseRd);

  // Actual score: 1 for correct prediction, 0 for wrong
  // Scaled by accuracy factor (how many bots matched / total)
  const s = won ? Math.max(0.6, accuracyFactor) : Math.min(0.4, 1 - accuracyFactor);

  // Step 3: g, E, v
  const gH = gFunc(phiH);
  const E = expectedOutcome(mu, muH, phiH);
  const v = 1 / (gH * gH * E * (1 - E));

  // Step 4: estimated improvement
  const delta = v * gH * (s - E);

  // Step 5: new volatility
  const sigma = computeVolatility(player.volatility, phi, v, delta, cfg);

  // Step 6: pre-rating-period RD
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);

  // Step 7: new RD and rating
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gH * (s - E);

  // Step 8: convert back
  const newRating = Math.round(fromMu(newMu));
  const newRd = Math.round(clampRd(newPhi * GLICKO2_SCALE, cfg));

  return {
    newRating,
    newRd,
    newVolatility: Math.round(sigma * 1_000_000) / 1_000_000,
    eloChange: newRating - player.rating,
  };
}
