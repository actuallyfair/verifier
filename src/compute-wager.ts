import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";

import { Currency } from "./generated/currency";
import {
  FairCoinToss,
  FairCoinToss_Choice,
} from "./generated/message-contexts/fair-coin-toss";
import { bytesToHex } from "@noble/hashes/utils";
import { MultiRoulette } from "./generated/message-contexts/multi-roulette";

export function computeFairCoinTossResult(sig: Uint8Array) {
  // We're going to hash the signature just to really be sure its fairly distributed
  const hash = sha256(sig);
  const result = hash[0] % 2;
  if (result == 0) {
    return FairCoinToss_Choice.HEADS;
  } else {
    return FairCoinToss_Choice.TAILS;
  }
}

export function computeFairCoinTossOutcome(sig: Uint8Array, w: FairCoinToss) {
  const result = computeFairCoinTossResult(sig);

  const win = w.playerChoice === result;

  const profit = win ? 1 : -1;

  return {
    result,
    playerProfit: { currency: Currency.CURRENCY_UNSPECIFIED, amount: profit },
  };
}

function doComputeCrashResult(hash: Uint8Array, houseEdge: number) {
  const nBits = 52;
  const hashHex = bytesToHex(hash);

  const seed = hashHex.slice(0, nBits / 4);
  const r = Number.parseInt(seed, 16);

  let X = r / 2 ** nBits; // uniformly distributed in [0; 1)
  let Y = 1 - X; // Now it's uniformly distributed in (0; 1], so it's safe to divide by it

  let result = (1 - houseEdge) / Y;

  result = Math.floor(result * 100) / 100;

  result = Math.max(1, result);

  return result;
}

export function computeCrashResult(
  vxSignature: Uint8Array,
  gameHash: Uint8Array, // This is the hash of the next from the hash chain
  houseEdge: number = 0
) {
  return doComputeCrashResult(hmac(sha256, vxSignature, gameHash), houseEdge);
}

export function computeCrashDiceResult(sig: Uint8Array, houseEdge: number) {
  return doComputeCrashResult(sha256(sig), houseEdge);
}

export function computeMultiRouletteResult(
  vxSignature: Uint8Array,
  bet: MultiRoulette
) {
  const hash = sha256(vxSignature);

  const nBits = 52;
  const hashHex = bytesToHex(hash);
  const seed = hashHex.slice(0, nBits / 4);
  const n = Number.parseInt(seed, 16);

  const v = n / 2 ** nBits; // uniform in [0; 1)

  let probabilitySum = 0;
  for (const outcome of bet.outcomes) {
    probabilitySum += outcome.probability;
    if (v < probabilitySum) {
      return outcome;
    }
  }
}

export function computeMineLocations(
  vxSignature: Uint8Array,
  revealedCells: Set<number>, // tiles we know are safe
  cells: number, // how many cells in total
  mines: number // how many mines there are going to be in total
) {
  let mineLocations = new Set<number>();

  for (let m = 0; m < mines; m++) {
    const cellsLeft = cells - revealedCells.size - m;

    if (cellsLeft == 0) {
      console.warn(
        "hmm trying to get mine locations when there's no locations left?"
      );
      break;
    }

    let mineIndex = Number(bytesToNumberBE(vxSignature) % BigInt(cellsLeft));

    for (let i = 0; i < cells; i++) {
      if (revealedCells.has(i)) {
        mineIndex++;
        continue;
      }
      if (mineIndex == i) {
        mineLocations.add(i);
        break;
      }
    }
  }

  return mineLocations;
}
