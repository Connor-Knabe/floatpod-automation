const createColorService = require('../colorService');

describe('colorService', () => {
  const options = { defaultColor: { hex: '#ffffff', name: 'Default' } };
  const service = createColorService(options);

  describe('hexToRgb', () => {
    test('converts 6-digit hex to RGB', () => {
      expect(service.hexToRgb('#ff5733')).toEqual({ r: 255, g: 87, b: 51 });
    });

    test('converts shorthand hex to RGB', () => {
      expect(service.hexToRgb('#03f')).toEqual({ r: 0, g: 51, b: 255 });
    });
  });

  describe('nearestColor', () => {
    test('returns correct base color for known hex', () => {
      expect(service.nearestColor('#ff0000')).toEqual({ hex: '#ff0000', name: 'Red' });
    });

    test('falls back to defaultColor when input is null', () => {
      expect(service.nearestColor(null)).toEqual(options.defaultColor);
    });
  });
});
