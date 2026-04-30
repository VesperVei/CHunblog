import type { GraphLayoutVisualConfig } from './types';

export const treeLayoutColors: GraphLayoutVisualConfig = {
  light: {
    levels: [
      { saturation: 72, lightness: 39, alpha: 0.95, strokeSaturation: 78, strokeLightness: 29, strokeAlpha: 0.95, radiusScale: 1.08 },
      { saturation: 66, lightness: 43, alpha: 0.89, strokeSaturation: 72, strokeLightness: 33, strokeAlpha: 0.87, radiusScale: 1.04 },
      { saturation: 58, lightness: 48, alpha: 0.81, strokeSaturation: 64, strokeLightness: 37, strokeAlpha: 0.79, radiusScale: 1 },
      { saturation: 50, lightness: 53, alpha: 0.71, strokeSaturation: 56, strokeLightness: 41, strokeAlpha: 0.71, radiusScale: 0.96 },
      { saturation: 42, lightness: 58, alpha: 0.59, strokeSaturation: 48, strokeLightness: 45, strokeAlpha: 0.63, radiusScale: 0.92 },
      { saturation: 34, lightness: 63, alpha: 0.47, strokeSaturation: 40, strokeLightness: 49, strokeAlpha: 0.55, radiusScale: 0.88 },
    ],
    edge: { defaultSaturation: 24, defaultLightness: 50, defaultAlpha: 0.23, mutedAlpha: 0.08, activeSaturation: 66, activeLightness: 45, activeAlpha: 0.6 },
    selectedStrokeWidth: 2.8,
    hoverStrokeWidth: 2.5,
    connectedStrokeWidth: 1.45,
  },
  dark: {
    levels: [
      { saturation: 80, lightness: 67, alpha: 0.97, strokeSaturation: 86, strokeLightness: 77, strokeAlpha: 0.97, radiusScale: 1.08 },
      { saturation: 74, lightness: 63, alpha: 0.91, strokeSaturation: 80, strokeLightness: 73, strokeAlpha: 0.89, radiusScale: 1.04 },
      { saturation: 66, lightness: 59, alpha: 0.83, strokeSaturation: 72, strokeLightness: 68, strokeAlpha: 0.81, radiusScale: 1 },
      { saturation: 58, lightness: 55, alpha: 0.73, strokeSaturation: 64, strokeLightness: 63, strokeAlpha: 0.73, radiusScale: 0.96 },
      { saturation: 50, lightness: 51, alpha: 0.61, strokeSaturation: 56, strokeLightness: 58, strokeAlpha: 0.65, radiusScale: 0.92 },
      { saturation: 42, lightness: 47, alpha: 0.49, strokeSaturation: 48, strokeLightness: 53, strokeAlpha: 0.57, radiusScale: 0.88 },
    ],
    edge: { defaultSaturation: 22, defaultLightness: 63, defaultAlpha: 0.21, mutedAlpha: 0.07, activeSaturation: 80, activeLightness: 71, activeAlpha: 0.64 },
    selectedStrokeWidth: 2.9,
    hoverStrokeWidth: 2.6,
    connectedStrokeWidth: 1.5,
  },
};
