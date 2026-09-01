import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let protocol: Protocol | null = null;

export function initializePMTiles() {
  if (protocol) {
    return protocol;
  }

  protocol = new Protocol();

  maplibregl.addProtocol("pmtiles", protocol.tile);

  return protocol;
}
