export function createNavigation(obstacles, PF, radius = 0.58) {
  const step = 0.2;
  const boxes = obstacles.map(b => ({ minX: b.minX - radius, maxX: b.maxX + radius, minZ: b.minZ - radius, maxZ: b.maxZ + radius }));
  const free = ([x, z]) => x >= radius && x <= 24 - radius && z >= -16 + radius && z <= -radius && !boxes.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  const point = (x, y) => [x * step, -y * step];
  const clear = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.04));
    for (let i = 0; i <= n; i++) if (!free([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])) return false;
    return true;
  };
  const matrix = Array.from({ length: 81 }, (_, y) => Array.from({ length: 121 }, (_, x) => free(point(x, y)) ? 0 : 1));
  const nodes = [];
  matrix.forEach((row, y) => row.forEach((blocked, x) => { if (!blocked) nodes.push({ x, y, p: point(x, y) }); }));
  function nearest(p, reachableFrom) {
    let best = null, distance = Infinity;
    for (const node of nodes) {
      const d = Math.hypot(node.p[0] - p[0], node.p[1] - p[1]);
      if (d < distance && (!reachableFrom || clear(reachableFrom, node.p))) { distance = d; best = node; }
    }
    return best;
  }
  function route(from, destination) {
    const start = nearest(from, from);
    const goal = nearest(destination);
    if (!start || !goal) return [];
    const cells = new PF.AStarFinder({ allowDiagonal: false }).findPath(start.x, start.y, goal.x, goal.y, new PF.Grid(121, 81, matrix));
    if (!cells.length) return [];
    const points = cells.map(([x, y]) => point(x, y));
    if (free(destination) && clear(points.at(-1), destination)) points.push(destination);
    return points;
  }
  function advance(position, route, distance) {
    let p = [...position];
    while (route.length && distance > 0) {
      const next = route[0], length = Math.hypot(next[0] - p[0], next[1] - p[1]);
      const fraction = length ? Math.min(1, distance / length) : 1;
      const candidate = [p[0] + (next[0] - p[0]) * fraction, p[1] + (next[1] - p[1]) * fraction];
      if (!clear(p, candidate)) { route.length = 0; break; }
      p = candidate;
      distance -= length;
      if (fraction === 1) route.shift(); else break;
    }
    return p;
  }
  return { free, clear, route, advance, nearest: p => nearest(p)?.p, obstacleCount: obstacles.length, radius };
}
