import { Loader } from '@googlemaps/js-api-loader';

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

export const mapsReady = !!KEY;

let _loader: Loader | null = null;

export function getMapsLoader(): Loader {
  if (!_loader) {
    _loader = new Loader({
      apiKey: KEY ?? '',
      version: 'weekly',
      libraries: ['places', 'routes'],
    });
  }
  return _loader;
}
