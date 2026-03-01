/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_cultureAgent from "../actions/cultureAgent.js";
import type * as actions_generateCultureScene from "../actions/generateCultureScene.js";
import type * as cultures from "../cultures.js";
import type * as lib_cityData from "../lib/cityData.js";
import type * as lib_elo from "../lib/elo.js";
import type * as players from "../players.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/cultureAgent": typeof actions_cultureAgent;
  "actions/generateCultureScene": typeof actions_generateCultureScene;
  cultures: typeof cultures;
  "lib/cityData": typeof lib_cityData;
  "lib/elo": typeof lib_elo;
  players: typeof players;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
