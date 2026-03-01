"use client";

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let extractor: FeatureExtractionPipeline | null = null;
let loading = false;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) {
    // Wait for existing load
    while (loading) await new Promise((r) => setTimeout(r, 100));
    return extractor!;
  }
  loading = true;
  extractor = await (pipeline as any)("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    device: typeof navigator !== "undefined" && "webgpu" in navigator ? "webgpu" : "wasm",
  });
  loading = false;
  return extractor!;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

/**
 * Score a user's prediction against all bot final beliefs.
 * Returns a score from 0-1 where 1 = perfect semantic match with dominant belief.
 */
export async function scorePrediction(
  prediction: string,
  botBeliefs: string[]
): Promise<{ similarities: number[]; avgSimilarity: number; maxSimilarity: number; rank: number }> {
  const ext = await getExtractor();

  // Embed prediction and all beliefs in batch
  const texts = [prediction, ...botBeliefs];
  const output = await ext(texts, { pooling: "mean", normalize: true });

  // Extract vectors
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from((output as any)[i].data as Float32Array));
  }

  const predVec = vectors[0];
  const similarities = vectors.slice(1).map((v) => cosineSimilarity(predVec, v));

  const sorted = [...similarities].sort((a, b) => b - a);
  const avgSimilarity = similarities.reduce((s, v) => s + v, 0) / similarities.length;
  const maxSimilarity = sorted[0] ?? 0;

  // Rank: how many beliefs are LESS similar than median
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const aboveMedian = similarities.filter((s) => s >= median).length;
  const rank = aboveMedian / similarities.length; // 0-1, higher = better

  return { similarities, avgSimilarity, maxSimilarity, rank };
}
