export type GraphNode = {
  id: string;
  kind?: 'note' | 'missing_note';
  exists?: boolean;
  unresolvedKey?: string;
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
  relationDepth?: number;
  graphLevel?: number;
  depthFromFocus?: number;
  primaryParentId?: string;
  siblingIndex?: number;
  siblingCount?: number;
  metadata?: Record<string, unknown>;
  missing?: {
    rawTargets: string[];
    normalizedTarget: string;
    sources: string[];
    reason: 'not_found' | 'ambiguous' | 'locale_unavailable' | string;
  };
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
export type GraphLayoutMode = 'force' | 'brain' | 'radial' | 'tree';

export type BrainRelationKind = 'current' | 'parent' | 'child' | 'sibling' | 'jump';

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
  linkOpacity?: number;
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
};

export type GraphViewOptions = {
  mode: GraphViewMode;
  locale: string;
  focusId?: string;
  settings: GraphSettings;
  navigationSearch?: string;
  activePresetId?: string;
  onNodeContextMenu?: (event: MouseEvent, node: GraphNode) => void;
};

export type BrainGraphNode = GraphNode & {
  brainRelation: BrainRelationKind;
  brainAnchorParentId?: string;
};
