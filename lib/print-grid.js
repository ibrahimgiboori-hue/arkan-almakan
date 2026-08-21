export const PRINT_GRID_MAJOR_COLUMNS = 24;
export const PRINT_GRID_SUBDIVISIONS = 2;
export const PRINT_GRID_COLUMNS = PRINT_GRID_MAJOR_COLUMNS * PRINT_GRID_SUBDIVISIONS;
export const PRINT_GRID_ROW_MM = 2;
export const PRINT_GRID_MIN_SPAN = PRINT_GRID_SUBDIVISIONS;
export const PRINT_GRID_SNAP_TOLERANCE = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function normalizeWeights(weights, count) {
  const source = Array.isArray(weights) && weights.length === count
    ? weights.map(Number)
    : Array.from({ length:count }, () => 100 / count);
  const total = source.reduce((sum, value) => (
    sum + (Number.isFinite(value) && value > 0 ? value : 0)
  ), 0) || 100;
  return source.map(value => (
    (Number.isFinite(value) && value > 0 ? value : 0) / total * 100
  ));
}

function sanitizeTracks(tracks, count, columns = PRINT_GRID_COLUMNS) {
  if (count <= 1) return [];
  const minSpan = count * PRINT_GRID_MIN_SPAN <= columns ? PRINT_GRID_MIN_SPAN : 1;
  const source = Array.isArray(tracks) ? tracks : [];
  const result = [];

  for (let index = 0; index < count - 1; index += 1) {
    const previous = index === 0 ? 0 : result[index - 1];
    const remainingCells = count - index - 1;
    const minimum = previous + minSpan;
    const maximum = columns - remainingCells * minSpan;
    const fallback = Math.round(((index + 1) / count) * columns);
    result.push(Math.round(clamp(source[index] ?? fallback, minimum, maximum)));
  }
  return result;
}

export function weightsToTracks(weights, count, columns = PRINT_GRID_COLUMNS) {
  const normalized = normalizeWeights(weights, count);
  let running = 0;
  const tracks = normalized.slice(0, -1).map(value => {
    running += value;
    return Math.round((running / 100) * columns);
  });
  return sanitizeTracks(tracks, count, columns);
}

export function spansToTracks(spans, count, columns = PRINT_GRID_COLUMNS) {
  if (!Array.isArray(spans) || spans.length !== count) {
    return weightsToTracks(null, count, columns);
  }
  const total = spans.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) || columns;
  let running = 0;
  const tracks = spans.slice(0, -1).map(value => {
    running += Math.max(0, Number(value) || 0);
    return Math.round((running / total) * columns);
  });
  return sanitizeTracks(tracks, count, columns);
}

export function tracksToSpans(tracks, count, columns = PRINT_GRID_COLUMNS) {
  const safe = sanitizeTracks(tracks, count, columns);
  const points = [0, ...safe, columns];
  return points.slice(1).map((point, index) => point - points[index]);
}

export function tracksToWeights(tracks, count, columns = PRINT_GRID_COLUMNS) {
  return tracksToSpans(tracks, count, columns).map(span => span / columns * 100);
}

export function resolveStoredTracks(value, defaults, count, columns = PRINT_GRID_COLUMNS) {
  if (Array.isArray(value)) return weightsToTracks(value, count, columns);
  if (value && typeof value === 'object') {
    const storedColumns = Math.max(1, Number(value.columns) || columns);
    if (Array.isArray(value.tracks)) {
      const scaled = value.tracks.map(track => Math.round(Number(track) / storedColumns * columns));
      return sanitizeTracks(scaled, count, columns);
    }
    if (Array.isArray(value.spans)) return spansToTracks(value.spans, count, columns);
    if (Array.isArray(value.weights)) return weightsToTracks(value.weights, count, columns);
  }
  return weightsToTracks(defaults, count, columns);
}

export function serializeTracks(tracks, count, columns = PRINT_GRID_COLUMNS) {
  const safe = sanitizeTracks(tracks, count, columns);
  return {
    version:2,
    columns,
    tracks:safe,
    spans:tracksToSpans(safe, count, columns),
  };
}

export function nearestGuide(track, guides = [], tolerance = PRINT_GRID_SNAP_TOLERANCE) {
  let nearest = null;
  let distance = Infinity;
  for (const guide of guides) {
    const candidate = Math.round(Number(guide));
    if (!Number.isFinite(candidate)) continue;
    const nextDistance = Math.abs(candidate - track);
    if (nextDistance < distance) {
      nearest = candidate;
      distance = nextDistance;
    }
  }
  return distance <= tolerance ? nearest : track;
}

export function moveTrackBoundary({
  tracks,
  boundaryIndex,
  desiredTrack,
  count,
  guides = [],
  columns = PRINT_GRID_COLUMNS,
}) {
  const safe = sanitizeTracks(tracks, count, columns);
  if (boundaryIndex < 0 || boundaryIndex >= safe.length) return safe;
  const minSpan = count * PRINT_GRID_MIN_SPAN <= columns ? PRINT_GRID_MIN_SPAN : 1;
  const previous = boundaryIndex === 0 ? 0 : safe[boundaryIndex - 1];
  const following = boundaryIndex === safe.length - 1 ? columns : safe[boundaryIndex + 1];
  const minimum = previous + minSpan;
  const maximum = following - minSpan;
  const clamped = Math.round(clamp(desiredTrack, minimum, maximum));
  const snapped = clamp(nearestGuide(clamped, guides), minimum, maximum);
  const next = [...safe];
  next[boundaryIndex] = Math.round(snapped);
  return next;
}

export function majorGuideTracks(columns = PRINT_GRID_COLUMNS) {
  return Array.from(
    { length:PRINT_GRID_MAJOR_COLUMNS - 1 },
    (_, index) => Math.round(((index + 1) / PRINT_GRID_MAJOR_COLUMNS) * columns),
  );
}

