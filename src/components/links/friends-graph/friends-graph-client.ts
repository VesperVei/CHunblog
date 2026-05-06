import * as d3 from 'd3';

type SourceNode = {
  id: string;
  type?: string;
  titles?: Record<string, string>;
  urls?: Record<string, string>;
  tags?: string[];
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

type SourceLink = {
  source: string;
  target: string;
  relation?: string;
};

type SourceGraph = {
  nodes: SourceNode[];
  links: SourceLink[];
};

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  kind: 'friend' | 'tag';
  label: string;
  url?: string;
  tags: string[];
  description?: string;
  avatar?: string;
  siteLabel?: string;
  size: number;
  metadata?: Record<string, unknown>;
};

type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
  relation?: string;
  kind: 'tag-link' | 'relation-link';
};

type GraphControls = {
  friendScale: number;
  tagScale: number;
  centerStrength: number;
  chargeStrength: number;
  linkStrength: number;
  linkDistance: number;
  showRelations: boolean;
};

const DEFAULT_CONTROLS: GraphControls = {
  friendScale: 1,
  tagScale: 1,
  centerStrength: 0.5,
  chargeStrength: 74,
  linkStrength: 1.0,
  linkDistance: 115,
  showRelations: true,
};

function getLocaleTitle(node: SourceNode, locale: string) {
  return node.titles?.[locale] ?? node.titles?.en ?? node.id;
}

function getLocaleUrl(node: SourceNode, locale: string) {
  return node.urls?.[locale] ?? node.urls?.en;
}

function getAvatarUrl(node: SourceNode) {
  const avatar = typeof node.metadata?.avatar === 'string' ? node.metadata.avatar : undefined;
  if (avatar) {
    return avatar;
  }

  const githubId = typeof node.metadata?.githubId === 'string' ? node.metadata.githubId : undefined;
  if (githubId) {
    return `https://github.com/${githubId}.png?size=160`;
  }

  return undefined;
}

function getSiteLabel(url?: string) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildGraph(root: HTMLElement) {
  const locale = root.dataset.locale || 'en';
  const sourceElement = root.querySelector<HTMLScriptElement>('[data-friends-graph-source]');
  if (!sourceElement?.textContent) {
    return null;
  }

  const source = JSON.parse(sourceElement.textContent) as SourceGraph;
  
  const nodeMap = new Map<string, GraphNode>();
  const nodes = source.nodes.map((node) => {
    const kind = node.type === 'friend' ? 'friend' : 'tag';
    const url = getLocaleUrl(node, locale);
    const graphNode: GraphNode = {
      id: node.id,
      kind,
      label: getLocaleTitle(node, locale),
      url,
      tags: node.tags ?? [],
      description: typeof node.metadata?.description === 'string' ? node.metadata.description : undefined,
      avatar: kind === 'friend' ? getAvatarUrl(node) : undefined,
      siteLabel: kind === 'friend' ? getSiteLabel(url) : undefined,
      size: typeof node.metadata?.size === 'number' ? Number(node.metadata.size) : 1,
      metadata: node.metadata,
      x: 0,
      y: 0,
    };
    nodeMap.set(graphNode.id, graphNode);
    return graphNode;
  });

  const links = source.links
    .map((link) => {
      const sourceNode = nodeMap.get(link.source);
      const targetNode = nodeMap.get(link.target);
      if (!sourceNode || !targetNode) {
        return null;
      }

      return {
        source: link.source,
        target: link.target,
        relation: link.relation,
        kind: sourceNode.kind === 'friend' && targetNode.kind === 'friend' ? 'relation-link' : 'tag-link',
      } satisfies GraphLink;
    })
    .filter((link): link is GraphLink => Boolean(link));

  return { nodes, links };
}

function getNodeRadius(node: GraphNode, controls: GraphControls) {
  if (node.kind === 'friend') {
    return (22 + node.size * 6) * controls.friendScale;
  }

  const widthBias = Math.min(node.label.length, 8) * 1.35;
  return (16 + widthBias + node.size * 4) * controls.tagScale;
}

function getTagRect(node: GraphNode, controls: GraphControls) {
  const radius = getNodeRadius(node, controls);
  const width = Math.max(58, node.label.length * 10 + 24) * controls.tagScale;
  return {
    width,
    height: Math.max(28, radius * 1.2),
    radius: Math.min(16, radius * 0.6),
  };
}

function resolveNodeId(node: string | GraphNode) {
  return typeof node === 'string' ? node : node.id;
}

function getSafeSvgId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '-');
}

function renderDetails(root: HTMLElement, node: GraphNode | null, links: GraphLink[], nodeLookup: Map<string, GraphNode>) {
  const panel = root.querySelector<HTMLElement>('[data-friends-graph-details]');
  const modal = root.querySelector<HTMLElement>('[data-friends-graph-details-modal]');
  if (!panel || !modal) {
    return;
  }

  const title = root.dataset.detailsTitle || 'Details';
  const hint = root.dataset.detailsHint || '';
  const visitGithubLabel = root.dataset.visitGithubLabel || 'Visit GitHub';
  const visitBlogLabel = root.dataset.visitBlogLabel || 'Visit Blog';
  const tagsLabel = root.dataset.tagsLabel || 'Tags';
  const relationsLabel = root.dataset.relationsLabel || 'Relations';
  const friendsLabel = root.dataset.friendsLabel || 'Related Friends';

  if (!node) {
    modal.hidden = true;
    panel.innerHTML = `<strong>${title}</strong><p>${hint}</p>`;
    return;
  }

  modal.hidden = false;

  if (node.kind === 'friend') {
    const related = links.filter((link) => link.kind === 'relation-link' && (resolveNodeId(link.source) === node.id || resolveNodeId(link.target) === node.id));
    const relationItems = related.map((link) => {
      const otherId = resolveNodeId(link.source) === node.id ? resolveNodeId(link.target) : resolveNodeId(link.source);
      const otherNode = nodeLookup.get(otherId);
      return `<li><strong>${link.relation ?? 'Relation'}</strong> · ${otherNode?.label ?? otherId.replace(/^friend:|^tag:/, '')}</li>`;
    }).join('');

    const avatarUrl = node.avatar?.replace('?size=160', '?size=320');
    const avatarClipId = `detail-avatar-${getSafeSvgId(node.id)}`;
    const avatarMarkup = avatarUrl
      ? `<svg class="friends-graph-detail-avatar-svg" viewBox="0 0 100 100" role="img" aria-label="${node.label}">
          <defs>
            <clipPath id="${avatarClipId}">
              <circle cx="50" cy="50" r="50" />
            </clipPath>
          </defs>
          <image href="${avatarUrl}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avatarClipId})" />
        </svg>`
      : `<span>${node.label.slice(0, 1).toUpperCase()}</span>`;

    const tagsMarkup = node.tags.length > 0
      ? `<div class="friends-graph-detail-section">
          <h4>${tagsLabel}</h4>
          <div class="friends-graph-detail-tags">
            ${node.tags.map((tag) => `<span class="friends-graph-detail-tag">${tag}</span>`).join('')}
          </div>
        </div>`
      : '';

    const relationsMarkup = relationItems
      ? `<div class="friends-graph-detail-section">
          <h4>${relationsLabel}</h4>
          <ul>${relationItems}</ul>
        </div>`
      : '';

    const githubId = typeof node.metadata?.githubId === 'string' ? node.metadata.githubId : undefined;
    const blogUrl = typeof node.metadata?.blog === 'string' ? node.metadata.blog : undefined;
    const githubUrl = githubId ? `https://github.com/${githubId}` : node.url;

    const buttonsMarkup = `
      <div class="friends-graph-detail-actions">
        ${githubId ? `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer" class="friends-graph-visit-btn">
          ${visitGithubLabel}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 3h7v7M13 3L3 13"/>
          </svg>
        </a>` : ''}
        ${blogUrl ? `<a href="${blogUrl}" target="_blank" rel="noopener noreferrer" class="friends-graph-visit-btn friends-graph-visit-btn-secondary">
          ${visitBlogLabel}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 3h7v7M13 3L3 13"/>
          </svg>
        </a>` : ''}
      </div>
    `;

    panel.innerHTML = `
      <strong>${node.label}</strong>
      <div class="friends-graph-detail-head">
        <div class="friends-graph-detail-avatar">${avatarMarkup}</div>
        <div class="friends-graph-detail-copy">
          ${node.description ? `<p>${node.description}</p>` : ''}
          ${node.siteLabel ? `<p class="friends-graph-detail-site">${node.siteLabel}</p>` : ''}
        </div>
      </div>
      ${tagsMarkup}
      ${relationsMarkup}
      ${buttonsMarkup}
    `;
  } else {
    const relatedFriends = links
      .filter((link) => link.kind === 'tag-link' && (resolveNodeId(link.source) === node.id || resolveNodeId(link.target) === node.id))
      .map((link) => {
        const otherId = resolveNodeId(link.source) === node.id ? resolveNodeId(link.target) : resolveNodeId(link.source);
        return nodeLookup.get(otherId);
      })
      .filter((n): n is GraphNode => Boolean(n) && n.kind === 'friend');

    const friendsMarkup = relatedFriends.length > 0
      ? `<div class="friends-graph-detail-section">
          <h4>${friendsLabel}</h4>
          <ul class="friends-graph-friend-list">
            ${relatedFriends.map((friend) => `<li>${friend.label}</li>`).join('')}
          </ul>
        </div>`
      : '';

    panel.innerHTML = `
      <strong>${tagsLabel}: ${node.label}</strong>
      ${node.description ? `<p>${node.description}</p>` : ''}
      ${friendsMarkup}
    `;
  }
}

function initFriendsGraph(root: HTMLElement) {
  const graph = buildGraph(root);
  if (!graph) {
    return;
  }

  const stage = root.querySelector<HTMLElement>('[data-friends-graph-stage]');
  const tip = root.querySelector<HTMLElement>('[data-friends-graph-relation-tip]');
  if (!stage || !tip) {
    return;
  }

  let controls: GraphControls = { ...DEFAULT_CONTROLS };
  let selectedNode: GraphNode | null = null;
  const nodeLookup = new Map(graph.nodes.map((node) => [node.id, node]));

  const svg = d3.create('svg');
  const viewport = svg.append('g').attr('class', 'friends-graph-viewport');
  const linkLayer = viewport.append('g').attr('class', 'friends-graph-links');
  const nodeLayer = viewport.append('g').attr('class', 'friends-graph-nodes');
  const labelLayer = viewport.append('g').attr('class', 'friends-graph-node-labels');
  stage.append(svg.node()!);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.45, 2.2])
    .on('zoom', (event) => {
      viewport.attr('transform', event.transform.toString());
    });

  svg.call(zoom as any);

  let width = Math.max(stage.clientWidth, 320);
  let height = Math.max(stage.clientHeight, 480);
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const simulation = d3.forceSimulation<GraphNode>(graph.nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links).id((node) => node.id).distance(() => controls.linkDistance).strength(() => controls.linkStrength))
    .force('charge', d3.forceManyBody<GraphNode>().strength((node) => node.kind === 'friend' ? -controls.chargeStrength : -5))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force('collision', d3.forceCollide<GraphNode>().radius((node) => node.kind === 'friend' ? getNodeRadius(node, controls) + 10 : getTagRect(node, controls).width / 2 + 10).strength(0.92));

  const myNode = graph.nodes.find((n) => n.id === 'friend:vespervei');
  
  if (myNode) {
    myNode.x = width / 2;
    myNode.y = height / 2;

    simulation.force('anchor', (alpha) => {
      myNode.vx = ((width / 2) - (myNode.x ?? 0)) * 0.16 * alpha;
      myNode.vy = ((height / 2) - (myNode.y ?? 0)) * 0.16 * alpha;
    });

    simulation.force('towardsMe', (alpha) => {
      const strength = controls.centerStrength * alpha;
      graph.nodes.forEach((node) => {
        if (node.kind === 'friend' && node.id !== 'friend:vespervei' && myNode.x !== undefined && myNode.y !== undefined && node.x !== undefined && node.y !== undefined) {
          const dx = myNode.x - node.x;
          const dy = myNode.y - node.y;
          node.vx = (node.vx ?? 0) + dx * strength * 0.01;
          node.vy = (node.vy ?? 0) + dy * strength * 0.01;
        }
      });
    });
  }

  const relationLinks = graph.links.filter((link) => link.kind === 'relation-link');
  const tagLinks = graph.links.filter((link) => link.kind === 'tag-link');

  const defs = svg.append('defs');
  graph.nodes.forEach((node) => {
    if (node.kind !== 'friend' || !node.avatar) {
      return;
    }

    const pattern = defs.append('pattern')
      .attr('id', `avatar-${node.id.replace(/[^a-z0-9_-]/gi, '-')}`)
      .attr('patternUnits', 'objectBoundingBox')
      .attr('width', 1)
      .attr('height', 1);

    pattern.append('image')
      .attr('href', node.avatar)
      .attr('width', 1)
      .attr('height', 1)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('crossorigin', 'anonymous');
  });

  const tagLinkSelection = linkLayer.selectAll<SVGLineElement, GraphLink>('.friends-graph-link-tag')
    .data(tagLinks)
    .join('line')
    .attr('class', 'friends-graph-link friends-graph-link-tag');

  const relationLinkSelection = linkLayer.selectAll<SVGLineElement, GraphLink>('.friends-graph-link-relation')
    .data(relationLinks)
    .join('line')
    .attr('class', 'friends-graph-link friends-graph-link-relation')
    .on('mouseenter', (event, link) => {
      if (!controls.showRelations || !link.relation) {
        return;
      }
      tip.hidden = false;
      tip.textContent = link.relation;
      const { offsetX, offsetY } = event;
      tip.style.left = `${offsetX + 14}px`;
      tip.style.top = `${offsetY + 10}px`;
    })
    .on('mousemove', (event, link) => {
      if (!controls.showRelations || !link.relation) {
        return;
      }
      tip.style.left = `${event.offsetX + 14}px`;
      tip.style.top = `${event.offsetY + 10}px`;
    })
    .on('mouseleave', () => {
      tip.hidden = true;
    });

  const nodeSelection = nodeLayer.selectAll<SVGGElement, GraphNode>('.friends-graph-node')
    .data(graph.nodes)
    .join('g')
    .attr('class', (node) => `friends-graph-node friends-graph-node-${node.kind}`)
    .style('cursor', 'pointer')
    .on('click', (_, node) => {
      selectedNode = node;
      renderDetails(root, node, graph.links, nodeLookup);
      paintSelection();
    });

  const clipPaths = defs.selectAll('.avatar-clip')
    .data(graph.nodes.filter((node) => node.kind === 'friend' && node.avatar))
    .join('clipPath')
      .attr('id', (node) => `clip-${getSafeSvgId(node.id)}`)
    .append('circle')
    .attr('cx', 0)
    .attr('cy', 0);

  nodeSelection.each(function (node) {
    const group = d3.select(this);
    if (node.kind === 'friend') {
      group.append('circle').attr('class', 'friends-graph-node-ring');
      if (node.avatar) {
        group.append('image')
          .attr('class', 'friends-graph-node-avatar')
          .attr('href', node.avatar)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .attr('clip-path', `url(#clip-${getSafeSvgId(node.id)})`);
      } else {
        group.append('circle').attr('class', 'friends-graph-node-core');
      }
      group.append('text').attr('class', 'friends-graph-node-fallback').attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').text(node.label.slice(0, 1).toUpperCase());
    } else {
      group.append('rect').attr('class', 'friends-graph-tag-box');
      group.append('text').attr('class', 'friends-graph-tag-text').attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').text(node.label);
    }
  });

  const labelSelection = labelLayer.selectAll<SVGTextElement, GraphNode>('.friends-graph-node-label')
    .data(graph.nodes.filter((node) => node.kind === 'friend'))
    .join('text')
    .attr('class', 'friends-graph-node-label')
    .attr('text-anchor', 'middle')
    .text((node) => node.label);

  nodeSelection.call(
    d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.18).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', (event, node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on('end', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
      }) as any,
  );

  function fitView() {
    simulation.stop();
    
    const myNode = graph.nodes.find((n) => n.id === 'friend:vespervei');
    const friendNodes = graph.nodes.filter((n) => n.kind === 'friend');
    
    if (!myNode || friendNodes.length === 0) {
      svg.transition().duration(320).call(zoom.transform as any, d3.zoomIdentity.translate(0, 0).scale(1));
      simulation.alpha(0.3).restart();
      return;
    }

    const padding = 80;
    const myX = myNode.x ?? width / 2;
    const myY = myNode.y ?? height / 2;
    const maxDx = Math.max(1, ...friendNodes.map((n) => Math.abs((n.x ?? myX) - myX) + getNodeRadius(n, controls)));
    const maxDy = Math.max(1, ...friendNodes.map((n) => Math.abs((n.y ?? myY) - myY) + getNodeRadius(n, controls) + 18));
    const scale = Math.max(0.35, Math.min(1.25, Math.min((width / 2 - padding) / maxDx, (height / 2 - padding) / maxDy)));

    const tx = width / 2 - myX * scale;
    const ty = height / 2 - myY * scale;
    
    svg.transition().duration(320).call(zoom.transform as any, d3.zoomIdentity.translate(tx, ty).scale(scale)).on('end', () => {
      simulation.alpha(0.3).restart();
    });
  }

  function refreshStageSize() {
    width = Math.max(stage.clientWidth, 320);
    height = Math.max(stage.clientHeight, 480);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    (simulation.force('center') as d3.ForceCenter<GraphNode>).x(width / 2).y(height / 2);
  }

  function refitWhenVisible() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshStageSize();
        simulation.alpha(0.45).restart();
        window.setTimeout(() => {
          refreshStageSize();
          fitView();
        }, 650);
      });
    });
  }

  function paintSelection() {
    nodeSelection.classed('is-selected', (node) => selectedNode?.id === node.id);
    relationLinkSelection.classed('is-highlighted', (link) => {
      if (!selectedNode) {
        return false;
      }
      return resolveNodeId(link.source) === selectedNode.id || resolveNodeId(link.target) === selectedNode.id;
    });
    tagLinkSelection.classed('is-highlighted', (link) => {
      if (!selectedNode) {
        return false;
      }
      return resolveNodeId(link.source) === selectedNode.id || resolveNodeId(link.target) === selectedNode.id;
    });
  }

  function refreshNodeVisuals() {
    nodeSelection.each(function (node) {
      const group = d3.select(this);
      if (node.kind === 'friend') {
        const radius = getNodeRadius(node, controls);
        group.select<SVGCircleElement>('.friends-graph-node-ring')
          .attr('r', radius + 4)
          .attr('fill', 'color-mix(in srgb, var(--accent-color) 8%, var(--glass-bg))')
          .attr('stroke', 'color-mix(in srgb, var(--accent-color) 34%, var(--fg-muted-2))')
          .attr('stroke-width', 1.5);

        const clipCircle = defs.select(`#clip-${getSafeSvgId(node.id)} circle`);
        if (!clipCircle.empty()) {
          clipCircle.attr('r', radius);
        }

        group.select<SVGImageElement>('.friends-graph-node-avatar')
          .attr('x', -radius)
          .attr('y', -radius)
          .attr('width', radius * 2)
          .attr('height', radius * 2);

        group.select<SVGCircleElement>('.friends-graph-node-core')
          .attr('r', radius)
          .attr('fill', 'color-mix(in srgb, var(--glass-bg) 84%, transparent)')
          .attr('stroke', 'rgba(255,255,255,0.18)')
          .attr('stroke-width', 1);

        group.select<SVGTextElement>('.friends-graph-node-fallback')
          .style('display', node.avatar ? 'none' : 'block')
          .attr('font-size', Math.max(13, radius * 0.72))
          .attr('fill', 'var(--accent-color)');
      } else {
        const rect = getTagRect(node, controls);
        group.select<SVGRectElement>('.friends-graph-tag-box')
          .attr('x', -rect.width / 2)
          .attr('y', -rect.height / 2)
          .attr('width', rect.width)
          .attr('height', rect.height)
          .attr('rx', rect.radius)
          .attr('fill', 'color-mix(in srgb, var(--glass-bg) 88%, transparent)')
          .attr('stroke', 'color-mix(in srgb, var(--accent-color) 24%, var(--fg-muted-2))')
          .attr('stroke-width', 1.25);

        group.select<SVGTextElement>('.friends-graph-tag-text')
          .attr('font-size', Math.max(12, rect.height * 0.38))
          .attr('fill', 'var(--fg-color)');
      }
    });

    labelSelection
      .attr('font-size', 12)
      .attr('fill', 'var(--fg-color)');
  }

  function refreshForces() {
    (simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>).distance(() => controls.linkDistance).strength(() => controls.linkStrength);
    (simulation.force('charge') as d3.ForceManyBody<GraphNode>).strength((node) => node.kind === 'friend' ? -controls.chargeStrength : -5);
    (simulation.force('collision') as d3.ForceCollide<GraphNode>).radius((node) => node.kind === 'friend' ? getNodeRadius(node, controls) + 10 : getTagRect(node, controls).width / 2 + 10);
    relationLinkSelection.style('display', controls.showRelations ? 'block' : 'none');
    
    if (myNode) {
      simulation.force('towardsMe', (alpha) => {
        const strength = controls.centerStrength * alpha;
        graph.nodes.forEach((node) => {
          if (node.kind === 'friend' && node.id !== 'friend:vespervei' && myNode.x !== undefined && myNode.y !== undefined && node.x !== undefined && node.y !== undefined) {
            const dx = myNode.x - node.x;
            const dy = myNode.y - node.y;
            node.vx = (node.vx ?? 0) + dx * strength * 0.01;
            node.vy = (node.vy ?? 0) + dy * strength * 0.01;
          }
        });
      });
    }
    
    simulation.alpha(0.7).restart();
  }

  function ticked() {
    tagLinkSelection
      .attr('x1', (link) => (link.source as GraphNode).x ?? 0)
      .attr('y1', (link) => (link.source as GraphNode).y ?? 0)
      .attr('x2', (link) => (link.target as GraphNode).x ?? 0)
      .attr('y2', (link) => (link.target as GraphNode).y ?? 0)
      .attr('stroke', 'color-mix(in srgb, var(--accent-color) 18%, var(--fg-muted-3))')
      .attr('stroke-width', 1.4)
      .attr('stroke-opacity', 0.82);

    relationLinkSelection
      .attr('x1', (link) => (link.source as GraphNode).x ?? 0)
      .attr('y1', (link) => (link.source as GraphNode).y ?? 0)
      .attr('x2', (link) => (link.target as GraphNode).x ?? 0)
      .attr('y2', (link) => (link.target as GraphNode).y ?? 0)
      .attr('stroke', 'color-mix(in srgb, var(--accent-color) 54%, var(--fg-color))')
      .attr('stroke-width', 2.1)
      .attr('stroke-dasharray', '0')
      .attr('stroke-opacity', 0.96);

    nodeSelection.attr('transform', (node) => `translate(${node.x ?? 0}, ${node.y ?? 0})`);
    labelSelection.attr('x', (node) => node.x ?? 0).attr('y', (node) => (node.y ?? 0) + getNodeRadius(node, controls) + 18);
  }

  simulation.on('tick', ticked);
  refreshNodeVisuals();
  paintSelection();

  root.querySelector('[data-friends-graph-fit]')?.addEventListener('click', () => {
    refitWhenVisible();
  });

  root.querySelector('[data-friends-graph-reset]')?.addEventListener('click', () => {
    controls = { ...DEFAULT_CONTROLS };
    root.querySelectorAll<HTMLInputElement>('[data-friends-graph-control]').forEach((input) => {
      const key = input.dataset.friendsGraphControl as keyof GraphControls | undefined;
      if (!key) {
        return;
      }

      const defaultValue = DEFAULT_CONTROLS[key];
      if (input.type === 'checkbox') {
        input.checked = Boolean(defaultValue);
      } else {
        input.value = String(defaultValue);
        const output = root.querySelector<HTMLOutputElement>(`[data-control-output="${key}"]`);
        if (output) {
          output.textContent = typeof defaultValue === 'number' ? defaultValue.toFixed(input.step?.includes('.') ? 2 : 0) : String(defaultValue);
        }
      }
    });
    refreshNodeVisuals();
    refreshForces();
    fitView();
  });

  const settingsToggle = root.querySelector('[data-friends-graph-settings-toggle]');
  const settingsPanel = root.querySelector<HTMLElement>('[data-friends-graph-settings]');
  const settingsClose = root.querySelector('[data-friends-graph-settings-close]');
  const modal = root.querySelector<HTMLElement>('[data-friends-graph-details-modal]');
  const modalBackdrop = root.querySelector('[data-modal-backdrop]');
  const modalClose = root.querySelector('[data-modal-close]');
  const fullscreenButton = root.querySelector<HTMLButtonElement>('[data-friends-graph-fullscreen]');
  const card = root.closest<HTMLElement>('.friends-graph-card');

  const updateFullscreenButton = () => {
    if (!fullscreenButton || !card) return;
    const isFullscreen = document.fullscreenElement === card;
    const enterLabel = root.dataset.enterFullscreenLabel || 'Enter Fullscreen';
    const exitLabel = root.dataset.exitFullscreenLabel || 'Exit Fullscreen';
    const label = isFullscreen ? exitLabel : enterLabel;
    fullscreenButton.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
    fullscreenButton.setAttribute('title', label);
    const span = fullscreenButton.querySelector('span');
    if (span) span.textContent = label;
  };

  fullscreenButton?.addEventListener('click', async () => {
    if (!card) return;
    if (document.fullscreenElement === card) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await card.requestFullscreen?.().catch(() => undefined);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButton();
    setTimeout(() => {
      width = Math.max(stage.clientWidth, 320);
      height = Math.max(stage.clientHeight, 480);
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      (simulation.force('center') as d3.ForceCenter<GraphNode>).x(width / 2).y(height / 2);
      simulation.alpha(0.3).restart();
      fitView();
    }, 100);
  });

  updateFullscreenButton();

  (root as any).__friendsGraphControls = {
    fitView: refitWhenVisible,
  };

  root.addEventListener('friends-graph:shown', refitWhenVisible);

  settingsToggle?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (!settingsPanel) {
      return;
    }
    const nextHidden = !settingsPanel.hidden;
    settingsPanel.hidden = nextHidden;
    button.setAttribute('aria-expanded', String(!nextHidden));
  });

  settingsClose?.addEventListener('click', () => {
    if (!settingsPanel || !settingsToggle) {
      return;
    }
    settingsPanel.hidden = true;
    (settingsToggle as HTMLButtonElement).setAttribute('aria-expanded', 'false');
  });

  const closeModal = () => {
    if (modal) {
      modal.hidden = true;
    }
    selectedNode = null;
    paintSelection();
  };

  modalClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
  });
  
  modalBackdrop?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
      if (settingsPanel && !settingsPanel.hidden) {
        settingsPanel.hidden = true;
        if (settingsToggle) {
          (settingsToggle as HTMLButtonElement).setAttribute('aria-expanded', 'false');
        }
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!settingsPanel || settingsPanel.hidden || !settingsToggle) {
      return;
    }
    const target = event.target as Node;
    if (!settingsPanel.contains(target) && !settingsToggle.contains(target)) {
      settingsPanel.hidden = true;
      (settingsToggle as HTMLButtonElement).setAttribute('aria-expanded', 'false');
    }
  });

  root.querySelectorAll<HTMLInputElement>('[data-friends-graph-control]').forEach((input) => {
    const key = input.dataset.friendsGraphControl as keyof GraphControls | undefined;
    if (!key) {
      return;
    }

    const output = root.querySelector<HTMLOutputElement>(`[data-control-output="${key}"]`);
    
    input.addEventListener('input', () => {
      const value = input.type === 'checkbox' ? input.checked : Number(input.value);
      
      controls = {
        ...controls,
        [key]: value,
      };

      if (output && input.type !== 'checkbox') {
        output.textContent = typeof value === 'number' ? value.toFixed(input.step?.includes('.') ? 2 : 0) : String(value);
      }

      refreshNodeVisuals();
      refreshForces();
    });
  });

  const resizeObserver = new ResizeObserver(() => {
    refreshStageSize();
    simulation.alpha(0.25).restart();
  });
  resizeObserver.observe(stage);

  setTimeout(() => {
    refitWhenVisible();
  }, 120);
}

function initAllFriendsGraphs() {
  document.querySelectorAll<HTMLElement>('[data-friends-graph]').forEach((root) => {
    if (root.dataset.friendsGraphReady === 'true') {
      return;
    }
    root.dataset.friendsGraphReady = 'true';
    initFriendsGraph(root);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllFriendsGraphs, { once: true });
} else {
  initAllFriendsGraphs();
}
