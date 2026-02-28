// Glicko-2 Rating System — adapted from conference-arena for multi-player battles
// Reference: http://www.glicko.net/glicko/glicko2.pdf

export const INITIAL_ELO = 1500;
export const INITIAL_RD = 200;
export const INITIAL_VOLATILITY = 0.06;

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
const GLICKO2_SCALE = 173.7178;

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

function gFunc(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedOutcome(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-gFunc(phiJ) * (mu - muJ)));
}

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

export function decayRd(
  rd: number,
  daysSinceLastMatch: number,
  cfg: GlickoConfig = DEFAULT_GLICKO_CONFIG
): number {
  return Math.min(cfg.maxRd, rd + cfg.rdDecayPerDay * daysSinceLastMatch);
}

/**
 * Pairwise Glicko-2 update for one player against one opponent.
 * For multi-player battles, call this for each pair and halve K-factor.
 */
export function pairwiseGlickoUpdate(
  player: GlickoInput,
  opponent: GlickoInput,
  playerWon: boolean,
  draw: boolean = false,
  cfg: GlickoConfig = DEFAULT_GLICKO_CONFIG
): GlickoResult {
  const now = Date.now();
  const daysInactive = Math.max(0, (now - player.lastMatchAt) / 86_400_000);
  const rd = decayRd(player.rd, daysInactive, cfg);

  const mu = toMu(player.rating);
  const phi = toPhi(rd);
  const muOpp = toMu(opponent.rating);
  const phiOpp = toPhi(opponent.rd);

  const s = draw ? 0.5 : playerWon ? 1 : 0;

  const gOpp = gFunc(phiOpp);
  const E = expectedOutcome(mu, muOpp, phiOpp);
  const v = 1 / (gOpp * gOpp * E * (1 - E));
  // Halve delta for multi-player (3-player decomposed into pairs)
  const delta = (v * gOpp * (s - E)) * 0.5;

  const newSigma = computeVolatility(player.volatility, phi, v, delta, cfg);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gOpp * (s - E) * 0.5;

  const newRating = Math.round(fromMu(newMu));
  const newRd = Math.round(clampRd(newPhi * GLICKO2_SCALE, cfg));

  return {
    newRating,
    newRd,
    newVolatility: Math.round(newSigma * 1_000_000) / 1_000_000,
    eloChange: newRating - player.rating,
  };
}

/**
 * Multi-player Glicko-2 update.
 * Decomposes N-player battle into pairwise comparisons.
 * Players sorted by placement (0 = 1st place).
 */
export function multiPlayerGlickoUpdate(
  players: { input: GlickoInput; placement: number }[]
): GlickoResult[] {
  const results: GlickoResult[] = players.map((p) => ({
    newRating: p.input.rating,
    newRd: p.input.rd,
    newVolatility: p.input.volatility,
    eloChange: 0,
  }));

  // For each pair, update ratings
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const draw = players[i].placement === players[j].placement;
      const iWon = players[i].placement < players[j].placement;

      const resultI = pairwiseGlickoUpdate(
        players[i].input,
        players[j].input,
        iWon,
        draw
      );
      const resultJ = pairwiseGlickoUpdate(
        players[j].input,
        players[i].input,
        !iWon && !draw,
        draw
      );

      // Accumulate changes
      results[i] = {
        newRating: results[i].newRating + resultI.eloChange,
        newRd: Math.min(results[i].newRd, resultI.newRd),
        newVolatility: resultI.newVolatility,
        eloChange: results[i].eloChange + resultI.eloChange,
      };
      results[j] = {
        newRating: results[j].newRating + resultJ.eloChange,
        newRd: Math.min(results[j].newRd, resultJ.newRd),
        newVolatility: resultJ.newVolatility,
        eloChange: results[j].eloChange + resultJ.eloChange,
      };
    }
  }

  return results;
}
