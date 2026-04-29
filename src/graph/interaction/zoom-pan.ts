import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

export function createSvgCanvas(width: number, height: number) {
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const canvas = svg.append('g').attr('data-graph-canvas', '');

  return { svg, canvas };
}

export function attachZoomPan(svg, canvas, width: number, height: number) {
  const minScale = 0.4;
  const maxScale = 3;
  const initialTransform = d3.zoomIdentity.translate(width * 0.12, height * 0.08).scale(1);
  let lastFitTransform = initialTransform;
  let overviewTransform = initialTransform;
  let hasUserInteracted = false;

  const zoom = d3
    .zoom()
    .scaleExtent([minScale, maxScale])
    .on('start', (event) => {
      if (event.sourceEvent) {
        hasUserInteracted = true;
      }
      svg.classed('is-dragging', true);
    })
    .on('zoom', (event) => {
      canvas.attr('transform', event.transform);
    })
    .on('end', () => {
      svg.classed('is-dragging', false);
    });

  svg.call(zoom);

  const applyTransform = (transform, animate = true) => {
    if (animate) {
      svg.transition().duration(180).call(zoom.transform, transform);
      return;
    }

    svg.call(zoom.transform, transform);
  };

  const fitView = (bounds, padding = 64, options = {}) => {
    if (!bounds) {
      return;
    }

    const {
      force = false,
      animate = true,
      updateOverview = true,
      maxScale: fitMaxScale = maxScale,
    } = options;
    if (hasUserInteracted && !force) {
      return;
    }

    const safeWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const safeHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const viewportWidth = Math.max(width - (padding * 2), 1);
    const viewportHeight = Math.max(height - (padding * 2), 1);
    const scale = Math.max(minScale, Math.min(fitMaxScale, Math.min(viewportWidth / safeWidth, viewportHeight / safeHeight)));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const transform = d3.zoomIdentity
      .translate((width / 2) - (scale * centerX), (height / 2) - (scale * centerY))
      .scale(scale);

    lastFitTransform = transform;
    if (updateOverview) {
      overviewTransform = transform;
    }
    applyTransform(transform, animate);
  };

  svg.call(zoom.transform, initialTransform);

  return {
    resetView() {
      applyTransform(overviewTransform);
    },
    zoomIn() {
      svg.transition().duration(140).call(zoom.scaleBy, 1.2);
    },
    zoomOut() {
      svg.transition().duration(140).call(zoom.scaleBy, 1 / 1.2);
    },
    fitView,
    getOverviewTransform() {
      return overviewTransform;
    },
  };
}
