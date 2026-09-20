import { geoCentroid, geoMercator, geoPath, geoGraticule10, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';

export function renderMap(target: HTMLElement, source: string, topology: boolean) {
  const parsed = JSON.parse(source);
  let data: GeoPermissibleObjects = parsed;
  if (topology) {
    if (parsed?.type !== 'Topology' || !parsed.objects || !Array.isArray(parsed.arcs)) throw new Error('Expected a TopoJSON topology.');
    const collection = parsed as Topology;
    data = { type: 'FeatureCollection', features: Object.values(collection.objects).flatMap(object => {
      const converted = feature(collection, object);
      return converted.type === 'FeatureCollection' ? converted.features : [converted];
    }) };
  }
  if (!data || !['Feature', 'FeatureCollection', 'GeometryCollection', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(data.type)) throw new Error('Expected GeoJSON geometry.');
  const projection = geoMercator().fitExtent([[24, 24], [736, 356]], data);
  if (!Number.isFinite(projection.scale()) || projection.scale() > 100_000) {
    const center = geoCentroid(data);
    if (!center.every(Number.isFinite)) throw new Error('The map has no valid coordinates.');
    projection.center(center).scale(Number.isFinite(projection.scale()) ? 100_000 : 150).translate([380, 190]);
  }
  const path = geoPath(projection).pointRadius(5);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 760 380');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', topology ? 'TopoJSON map' : 'GeoJSON map');
  for (const [geometry, className] of [[geoGraticule10(), 'map-grid'], [data, 'map-features']] as const) {
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path(geometry) ?? '');
    shape.setAttribute('class', className);
    svg.append(shape);
  }
  target.append(svg);
  return () => {};
}
