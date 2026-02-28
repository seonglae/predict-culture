/**
 * Score a prediction based on distance to accident and timing.
 *
 * Distance (70%): Gaussian decay — only predictions within ~15% of map radius score well.
 * Timing (30%): Earlier predictions get higher bonus.
 * Combined: scaled to 0-1000.
 */

export function calculateScore(
  prediction: { x: number; z: number },
  accidentPoint: { x: number; z: number },
  predictionTime: number, // seconds into simulation when prediction was made
  accidentTime: number, // seconds when accident occurred
  mapRadius: number
): { score: number; distanceScore: number; timingScore: number } {
  // Distance score: Gaussian decay
  const dx = prediction.x - accidentPoint.x;
  const dz = prediction.z - accidentPoint.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const sigma = 0.15 * mapRadius;
  const distanceScore = Math.exp(-(distance * distance) / (2 * sigma * sigma));

  // Timing score: earlier = better
  const timingScore =
    predictionTime < accidentTime
      ? (accidentTime - predictionTime) / accidentTime
      : 0;

  // Combined score
  const combined = distanceScore * 0.7 + timingScore * 0.3;
  const score = Math.round(combined * 1000);

  return {
    score,
    distanceScore: Math.round(distanceScore * 1000),
    timingScore: Math.round(timingScore * 1000),
  };
}
