import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

export function createSvgCanvas(width: number, height: number) {
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const canvas = svg.append('g').attr('data-graph-canvas', '');

  return { svg, canvas };
}

export function attachZoomPan(svg, canvas, width: number, height: number) {
  const initialTransform = d3.zoomIdentity.translate(width * 0.12, height * 0.08).scale(1);

  const zoom = d3
    .zoom()
    .scaleExtent([0.4, 3])
    .on('start', () => {
      svg.classed('is-dragging', true);
    })
    .on('zoom', (event) => {
      canvas.attr('transform', event.transform);
    })
    .on('end', () => {
      svg.classed('is-dragging', false);
    });

  svg.call(zoom);

  const applyTransform = (transform) => {
    svg.transition().duration(180).call(zoom.transform, transform);
  };

  svg.call(zoom.transform, initialTransform);

  return {
    resetView() {
      applyTransform(initialTransform);
    },
    zoomIn() {
      svg.transition().duration(140).call(zoom.scaleBy, 1.2);
    },
    zoomOut() {
      svg.transition().duration(140).call(zoom.scaleBy, 1 / 1.2);
    },
  };
}
