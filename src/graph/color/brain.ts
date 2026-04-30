import type { GraphLayoutVisualConfig } from './types';

export const brainLayoutColors: GraphLayoutVisualConfig = {
  light: {
    levels: [
      { saturation: 72, lightness: 40, alpha: 0.94, strokeSaturation: 76, strokeLightness: 30, strokeAlpha: 0.94, radiusScale: 1.06 },
      { saturation: 66, lightness: 44, alpha: 0.88, strokeSaturation: 70, strokeLightness: 34, strokeAlpha: 0.86, radiusScale: 1.02 },
      { saturation: 58, lightness: 48, alpha: 0.8, strokeSaturation: 62, strokeLightness: 38, strokeAlpha: 0.78, radiusScale: 0.98 },
      { saturation: 50, lightness: 52, alpha: 0.7, strokeSaturation: 54, strokeLightness: 42, strokeAlpha: 0.7, radiusScale: 0.94 },
      { saturation: 42, lightness: 57, alpha: 0.58, strokeSaturation: 46, strokeLightness: 46, strokeAlpha: 0.62, radiusScale: 0.9 },
      { saturation: 34, lightness: 62, alpha: 0.46, strokeSaturation: 38, strokeLightness: 50, strokeAlpha: 0.54, radiusScale: 0.86 },
    ],
    edge: { defaultSaturation: 24, defaultLightness: 48, defaultAlpha: 0.24, mutedAlpha: 0.08, activeSaturation: 64, activeLightness: 44, activeAlpha: 0.6 },
    selectedStrokeWidth: 2.8,
    hoverStrokeWidth: 2.5,
    connectedStrokeWidth: 1.45,
  },
  dark: {
    levels: [
      { saturation: 80, lightness: 66, alpha: 0.96, strokeSaturation: 86, strokeLightness: 76, strokeAlpha: 0.96, radiusScale: 1.06 },
      { saturation: 74, lightness: 62, alpha: 0.9, strokeSaturation: 80, strokeLightness: 72, strokeAlpha: 0.88, radiusScale: 1.02 },
      { saturation: 66, lightness: 58, alpha: 0.82, strokeSaturation: 72, strokeLightness: 67, strokeAlpha: 0.8, radiusScale: 0.98 },
      { saturation: 58, lightness: 54, alpha: 0.72, strokeSaturation: 64, strokeLightness: 62, strokeAlpha: 0.72, radiusScale: 0.94 },
      { saturation: 50, lightness: 50, alpha: 0.6, strokeSaturation: 56, strokeLightness: 57, strokeAlpha: 0.64, radiusScale: 0.9 },
      { saturation: 42, lightness: 46, alpha: 0.48, strokeSaturation: 48, strokeLightness: 52, strokeAlpha: 0.56, radiusScale: 0.86 },
    ],
    edge: { defaultSaturation: 22, defaultLightness: 62, defaultAlpha: 0.2, mutedAlpha: 0.07, activeSaturation: 80, activeLightness: 70, activeAlpha: 0.64 },
    selectedStrokeWidth: 2.9,
    hoverStrokeWidth: 2.6,
    connectedStrokeWidth: 1.5,
  },
};
