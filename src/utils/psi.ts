/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Calculates the Population Stability Index (PSI) for a feature.
 * Formula: PSI = sum( (Actual% - Expected%) * ln(Actual% / Expected%) )
 *
 * Interpretation:
 * - PSI < 0.1: Minimal change (Stable)
 * - 0.1 <= PSI <= 0.25: Moderate change (Mild Drift)
 * - PSI > 0.25: Significant change (High Drift / Retraining Triggered)
 */
export function calculatePSI(
  actualValues: number[],
  binEdges: number[], // Edges of the bins (excluding -Infinity and +Infinity)
  expectedFrequencies: number[] // Frequencies in the historical/training dataset (sum to 1.0)
): number {
  if (actualValues.length === 0) return 0;

  const numBins = expectedFrequencies.length;
  const actualCounts = new Array(numBins).fill(0);

  // Classify each actual value into a bin
  for (const val of actualValues) {
    let placed = false;
    for (let i = 0; i < binEdges.length; i++) {
      if (val <= binEdges[i]) {
        actualCounts[i]++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      actualCounts[numBins - 1]++;
    }
  }

  // Calculate percentages with a tiny smoothing epsilon to avoid division-by-zero or log-of-zero
  const epsilon = 0.0001;
  const actualFrequencies = actualCounts.map(
    (count) => count / actualValues.length
  );

  let psiValue = 0;
  for (let i = 0; i < numBins; i++) {
    // Smooth actual and expected to be non-zero percentages
    const act = actualFrequencies[i] < epsilon ? epsilon : actualFrequencies[i];
    const exp = expectedFrequencies[i] < epsilon ? epsilon : expectedFrequencies[i];

    // Compute the bin contribution to PSI
    const binPsi = (act - exp) * Math.log(act / exp);
    psiValue += binPsi;
  }

  return Number(psiValue.toFixed(4));
}

/**
 * Historical/Training distribution specifications (Reference Baseline)
 */
export const FEATURE_PROFILES = {
  RSI: {
    name: "RSI (14)",
    // Bin edges: <=30, <=45, <=55, <=70, >70
    binEdges: [30, 45, 55, 70],
    expectedFreqs: [0.10, 0.25, 0.30, 0.25, 0.10],
  },
  MACD: {
    name: "MACD Spread %",
    // Bin edges: <=-0.5%, <=-0.1%, <=0.1%, <=0.5%, >0.5%
    binEdges: [-0.5, -0.1, 0.1, 0.5],
    expectedFreqs: [0.15, 0.25, 0.20, 0.25, 0.15],
  },
  VOLATILITY: {
    name: "ATR Volatility Ratio",
    // Bin edges: <=0.7, <=0.9, <=1.1, <=1.4, >1.4
    binEdges: [0.7, 0.9, 1.1, 1.4],
    expectedFreqs: [0.15, 0.25, 0.35, 0.15, 0.10],
  },
};
