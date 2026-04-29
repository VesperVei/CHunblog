import type { GraphForceSettings } from '../types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toPhysicalForces(forces: GraphForceSettings = {}) {
  const centerStrength = clamp(forces.centerStrength ?? 0.518713248970312, 0, 1);
  const localGravityStrength = clamp(forces.localGravityStrength ?? 0.1, 0, 0.4);
  const repelStrength = clamp(forces.repelStrength ?? 35, 0, 100);
  const linkStrength = clamp(forces.linkStrength ?? 1, 0, 1);
  const linkDistance = clamp(forces.linkDistance ?? 250, 30, 320);
  const collisionStrength = clamp(forces.collisionStrength ?? 0.75, 0, 1);
  const collisionPadding = Math.max(0, forces.collisionPadding ?? 8);
  const velocityDecay = clamp(forces.velocityDecay ?? 0.38, 0.15, 0.75);
  const alphaDecay = clamp(forces.alphaDecay ?? 0.022, 0.005, 0.08);
  const alphaTargetOnDrag = clamp(forces.alphaTargetOnDrag ?? 0.28, 0, 1);
  const alphaOnSettingsChange = clamp(forces.alphaOnSettingsChange ?? 0.6, 0, 1);
  const chargeDistanceMin = clamp(forces.chargeDistanceMin ?? 12, 1, 80);
  const chargeDistanceMax = forces.chargeDistanceMax === undefined
    ? clamp(linkDistance * 7, 500, 1400)
    : clamp(forces.chargeDistanceMax, 100, 3000);
  const linkIterations = Math.round(clamp(forces.linkIterations ?? 1, 1, 4));
  const collideIterations = Math.round(clamp(forces.collideIterations ?? 1, 1, 4));
  const repel01 = repelStrength / 100;
  const center01 = centerStrength;
  const link01 = linkStrength;
  const chargeStrength = -(Math.pow(repel01, 1.25) * 520);
  const centerPhysicalStrength = 0.005 + Math.pow(center01, 1.15) * 0.18;
  const linkPhysicalStrength = Math.min(1.5, 0.02 + Math.pow(link01, 1.1) * 1.35);

  return {
    centerStrength,
    localGravityStrength,
    physicalCenterStrength: centerPhysicalStrength,
    chargeStrength,
    linkStrength: linkPhysicalStrength,
    linkDistance,
    collisionStrength,
    collisionPadding,
    velocityDecay,
    alphaDecay,
    alphaTargetOnDrag,
    alphaOnSettingsChange,
    chargeDistanceMin,
    chargeDistanceMax,
    linkIterations,
    collideIterations,
  };
}
