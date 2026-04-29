export type GraphNode = {
  id: string;
  kind?: 'note';
  titles: Record<string, string>;
  urls: Record<string, string>;
  tags: string[];
  type?: string;
  lang?: string;
  aliases: string[];
  role?: string;
  graphLevel?: number;
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

export type GraphForceSettings = {
  centerStrength?: number;
  repelStrength?: number;
  linkStrength?: number;
  linkDistance?: number;
  collisionRadius?: number;
  collisionStrength?: number;
  alphaTargetOnDrag?: number;
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
};

export type GraphViewOptions = {
  mode: GraphViewMode;
  locale: string;
  focusId?: string;
  settings: GraphSettings;
  navigationSearch?: string;
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
