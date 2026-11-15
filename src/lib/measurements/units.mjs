// Base dimensions: meters, grams, liters, Celsius. Gallons and ounces are
// deliberately distinct. No inference from arbitrary question wording.
export const units = Object.freeze({
  km: { dimension: 'length', factor: 1000 }, m: { dimension: 'length', factor: 1 },
  cm: { dimension: 'length', factor: .01 }, mm: { dimension: 'length', factor: .001 },
  mi: { dimension: 'length', factor: 1609.344, metric: 'km' },
  ft: { dimension: 'length', factor: .3048, metric: 'm' },
  in: { dimension: 'length', factor: .0254, metric: 'cm' },
  kg: { dimension: 'mass', factor: 1000 }, g: { dimension: 'mass', factor: 1 },
  lb: { dimension: 'mass', factor: 453.59237, metric: 'kg' },
  oz_mass: { dimension: 'mass', factor: 28.349523125, metric: 'g' },
  L: { dimension: 'volume', factor: 1 }, mL: { dimension: 'volume', factor: .001 },
  gal_us: { dimension: 'volume', factor: 3.785411784, metric: 'L' },
  gal_imperial: { dimension: 'volume', factor: 4.54609, metric: 'L' },
  fl_oz_us: { dimension: 'volume', factor: .0295735295625, metric: 'mL' },
  C: { dimension: 'temperature', factor: 1 },
  F: { dimension: 'temperature', factor: 5 / 9, offset: -32 * 5 / 9, metric: 'C' },
});
