import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter((components as any).rateLimiter, {
  battleCreate: { kind: "fixed window", rate: 20, period: HOUR },
  battleJoin: { kind: "fixed window", rate: 30, period: HOUR },
  predictionSubmit: { kind: "fixed window", rate: 60, period: MINUTE },
});
