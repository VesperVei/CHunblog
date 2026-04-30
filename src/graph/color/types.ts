export type GraphLevelVisualStyle = {
  saturation: number;
  lightness: number;
  alpha: number;
  strokeSaturation: number;
  strokeLightness: number;
  strokeAlpha: number;
  radiusScale: number;
};

export type GraphEdgeVisualStyle = {
  defaultSaturation: number;
  defaultLightness: number;
  defaultAlpha: number;
  mutedAlpha: number;
  activeSaturation: number;
  activeLightness: number;
  activeAlpha: number;
};

export type GraphLayoutVisualMode = {
  levels: [
    GraphLevelVisualStyle,
    GraphLevelVisualStyle,
    GraphLevelVisualStyle,
    GraphLevelVisualStyle,
    GraphLevelVisualStyle,
    GraphLevelVisualStyle,
  ];
  edge: GraphEdgeVisualStyle;
  selectedStrokeWidth: number;
  hoverStrokeWidth: number;
  connectedStrokeWidth: number;
};

export type GraphLayoutVisualConfig = {
  light: GraphLayoutVisualMode;
  dark: GraphLayoutVisualMode;
};
