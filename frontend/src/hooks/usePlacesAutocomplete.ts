import { useState, useEffect, useRef, useCallback } from 'react';
import { loadMapsLibrary, mapsReady } from '../lib/mapsLoader';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  name: string;
  // Address-component names useful for detecting the sub-county / constituency.
  subCountyCandidates: string[];
}

// Google address-component types that can carry a Nairobi sub-county/constituency.
const SUBCOUNTY_TYPES = new Set([
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'locality',
  'neighborhood',
]);

export function usePlacesAutocomplete(countryCode = 'ke') {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (!mapsReady) return;
    loadMapsLibrary('places')
      .then(() => {
        serviceRef.current = new google.maps.places.AutocompleteService();
        geocoderRef.current = new google.maps.Geocoder();
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    (input: string) => {
      if (!input || input.length < 3 || !serviceRef.current) {
        setSuggestions([]);
        return;
      }
      setIsLoading(true);
      serviceRef.current.getPlacePredictions(
        {
          input,
          componentRestrictions: { country: countryCode },
          types: ['geocode', 'establishment'],
        },
        (predictions, status) => {
          setIsLoading(false);
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(
              predictions.map(p => ({ placeId: p.place_id, description: p.description }))
            );
          } else {
            setSuggestions([]);
          }
        }
      );
    },
    [countryCode]
  );

  const getDetails = useCallback((placeId: string): Promise<PlaceDetails> => {
    return new Promise((resolve, reject) => {
      if (!geocoderRef.current) { reject(new Error('Geocoder not ready')); return; }
      geocoderRef.current.geocode({ placeId }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
          const r = results[0];
          const subCountyCandidates = (r.address_components ?? [])
            .filter(c => c.types.some(t => SUBCOUNTY_TYPES.has(t)))
            .map(c => c.long_name);
          resolve({
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
            name: r.formatted_address.split(',').slice(0, 2).join(',').trim(),
            subCountyCandidates,
          });
        } else {
          reject(new Error('Geocode failed'));
        }
      });
    });
  }, []);

  const clear = useCallback(() => setSuggestions([]), []);

  return { suggestions, isLoading, search, getDetails, clear, available: mapsReady };
}
