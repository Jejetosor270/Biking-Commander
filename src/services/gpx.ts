import type { RouteOption } from "../domain/types";

export function routeToGpx(route: RouteOption): string {
  const points = route.geometry
    .map((point, index) => {
      const elevation =
        point.elevationM ??
        route.elevationProfile.points[
          Math.min(index, route.elevationProfile.points.length - 1)
        ]?.elevationM ??
        0;
      return `      <trkpt lat="${point.lat.toFixed(7)}" lon="${point.lng.toFixed(7)}"><ele>${Math.round(elevation)}</ele></trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Biking Commander" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <desc>${escapeXml(route.summary)}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(route.name)}</name>
    <type>${route.routeType}</type>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadRouteAsGpx(route: RouteOption): void {
  const blob = new Blob([routeToGpx(route)], {
    type: "application/gpx+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(route.name)}.gpx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
