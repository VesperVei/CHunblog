import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

export function attachNodeDrag(nodeSelection, simulation, alphaTargetOnDrag = 0.25) {
  nodeSelection.call(
    d3.drag()
      .on('start', (event, node) => {
        event.sourceEvent?.stopPropagation?.();
        (node as any).__dragMoved = false;

        if (!event.active) {
          simulation.alphaTarget(alphaTargetOnDrag).restart();
        }

        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', (event, node) => {
        event.sourceEvent?.stopPropagation?.();
        (node as any).__dragMoved = true;
        node.fx = event.x;
        node.fy = event.y;
      })
      .on('end', (event, node) => {
        event.sourceEvent?.stopPropagation?.();

        if (!event.active) {
          simulation.alphaTarget(0);
        }

        node.fx = null;
        node.fy = null;
      }),
  );
}
