export type GraphNode = {
  id: string;
  kind?: 'note';
  path?: string;
  createdAt?: string;
  updatedAt?: string;
  titles: Record<string, string>;
  urls: Record<string, string>;
  tags: string[];
  type?: string;
  lang?: string;
  aliases: string[];
  role?: string;
  graphLevel?: number;
  depthFromFocus?: number;
  primaryParentId?: string;
  siblingIndex?: number;
  siblingCount?: number;
  metadata?: Record<string, unknown>;
};

export type GraphEdge = {
  source: string | GraphNode;
  target: string | GraphNode;
  exists: boolean;
  targetHeading?: string;
  relation?: string;
  weight?: number;
};

export type GraphData = {
  generatedAt: string;
  nodes: GraphNode[];
  links: GraphEdge[];
  missing?: unknown[];
};

export type GraphViewMode = 'local' | 'global';
export type GraphDirection = 'outgoing' | 'incoming' | 'both';
export type GraphLayoutMode = 'force' | 'brain' | 'radial' | 'hierarchy';

export type BrainRelationKind = 'current' | 'parent' | 'child' | 'sibling' | 'jump';

export type GraphColorGroupMatchKind = 'property';

export type GraphColorGroupMatch = {
  kind: GraphColorGroupMatchKind;
  key: string;
  value: string | number | boolean;
};

export type GraphColorGroup = {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  priority: number;
  builtin?: boolean;
  match?: GraphColorGroupMatch;
  rule?: {
    type?: 'graphLevel' | 'path' | 'tag' | 'title' | 'property' | 'query';
    level?: number;
    value?: string;
    propertyKey?: string;
    propertyValue?: string | number | boolean;
  };
};

export type GraphHoverState = {
  hoveredNodeId?: string;
  connectedNodeIds: Set<string>;
  connectedLinkIds: Set<string>;
};

export type GraphForceSettings = {
  centerStrength?: number;
  localGravityStrength?: number;
  repelStrength?: number;
  linkStrength?: number;
  linkDistance?: number;
  collisionStrength?: number;
  collisionPadding?: number;
  velocityDecay?: number;
  alphaDecay?: number;
  alphaTargetOnDrag?: number;
  alphaOnSettingsChange?: number;
  chargeDistanceMin?: number;
  chargeDistanceMax?: number;
  linkIterations?: number;
  collideIterations?: number;
  childClusterStrength?: number;
  childClusterRadiusFactor?: number;
};

export type GraphAppearanceSettings = {
  showArrows?: boolean;
  textOpacity?: number;
  nodeRadius?: number;
  focusNodeRadius?: number;
  linkWidth?: number;
  labelSize?: number;
};

export type GraphFilterSettings = {
  searchQuery?: string;
  depth?: number;
  showBacklinks?: boolean;
  showForwardLinks?: boolean;
  showCrossLinks?: boolean;
  showTags?: boolean;
  showAttachments?: boolean;
  onlyExistingNotes?: boolean;
};

export type GraphLayoutSettings = {
  preset?: GraphLayoutMode;
  brainAnchorStrength?: number;
  preserveSelectedPreset?: boolean;
};

export type GraphSettings = {
  filters: GraphFilterSettings;
  appearance: GraphAppearanceSettings;
  forces: GraphForceSettings;
  layout: GraphLayoutSettings;
  colorGroups: GraphColorGroup[];
};

export type GraphViewOptions = {
  mode: GraphViewMode;
  locale: string;
  focusId?: string;
  settings: GraphSettings;
  navigationSearch?: string;
  activePresetId?: string;
};

export type BrainGraphNode = GraphNode & {
  brainRelation: BrainRelationKind;
  degree?: number;
  targetX?: number;
  targetY?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};
