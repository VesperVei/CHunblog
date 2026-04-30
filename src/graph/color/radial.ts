import type { GraphLayoutVisualConfig } from './types';

export const radialLayoutColors: GraphLayoutVisualConfig = {
  light: {
    levels: [
      { saturation: 76, lightness: 40, alpha: 0.96, strokeSaturation: 80, strokeLightness: 30, strokeAlpha: 0.96, radiusScale: 1.08 },
      { saturation: 70, lightness: 44, alpha: 0.9, strokeSaturation: 74, strokeLightness: 34, strokeAlpha: 0.88, radiusScale: 1.04 },
      { saturation: 62, lightness: 49, alpha: 0.82, strokeSaturation: 66, strokeLightness: 38, strokeAlpha: 0.8, radiusScale: 1 },
      { saturation: 54, lightness: 54, alpha: 0.72, strokeSaturation: 58, strokeLightness: 42, strokeAlpha: 0.72, radiusScale: 0.96 },
      { saturation: 46, lightness: 58, alpha: 0.6, strokeSaturation: 50, strokeLightness: 46, strokeAlpha: 0.64, radiusScale: 0.92 },
      { saturation: 38, lightness: 63, alpha: 0.48, strokeSaturation: 42, strokeLightness: 50, strokeAlpha: 0.56, radiusScale: 0.88 },
    ],
    edge: { defaultSaturation: 26, defaultLightness: 50, defaultAlpha: 0.24, mutedAlpha: 0.08, activeSaturation: 70, activeLightness: 46, activeAlpha: 0.62 },
    selectedStrokeWidth: 2.8,
    hoverStrokeWidth: 2.5,
    connectedStrokeWidth: 1.45,
  },
  dark: {
    levels: [
      { saturation: 84, lightness: 68, alpha: 0.98, strokeSaturation: 88, strokeLightness: 78, strokeAlpha: 0.98, radiusScale: 1.08 },
      { saturation: 78, lightness: 64, alpha: 0.92, strokeSaturation: 82, strokeLightness: 74, strokeAlpha: 0.9, radiusScale: 1.04 },
      { saturation: 70, lightness: 60, alpha: 0.84, strokeSaturation: 74, strokeLightness: 69, strokeAlpha: 0.82, radiusScale: 1 },
      { saturation: 62, lightness: 56, alpha: 0.74, strokeSaturation: 66, strokeLightness: 64, strokeAlpha: 0.74, radiusScale: 0.96 },
      { saturation: 54, lightness: 52, alpha: 0.62, strokeSaturation: 58, strokeLightness: 58, strokeAlpha: 0.66, radiusScale: 0.92 },
      { saturation: 46, lightness: 48, alpha: 0.5, strokeSaturation: 50, strokeLightness: 54, strokeAlpha: 0.58, radiusScale: 0.88 },
    ],
    edge: { defaultSaturation: 24, defaultLightness: 64, defaultAlpha: 0.22, mutedAlpha: 0.07, activeSaturation: 82, activeLightness: 72, activeAlpha: 0.66 },
    selectedStrokeWidth: 2.9,
    hoverStrokeWidth: 2.6,
    connectedStrokeWidth: 1.5,
  },
};
