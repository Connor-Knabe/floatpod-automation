module.exports = function (options) {
	const baseColors = [
		{
			"hex": "#FFFFFF",
			"name": "White",
		},
		{
			"hex": "#000000",
			"name": "Black",
		},
                {
                        "hex": "#808080",
                        "name": "Gray",
                },

		{
			"hex": "#ff0000",
			"name": "Red",
		},
		{
			"hex": "#ffa500",
			"name": "Orange",
		},
		{
			"hex": "#ffff00",
			"name": "Yellow",
		},
		{
			"hex": "#008000",
			"name": "Green",
		},
		{
			"hex": "#0000ff",
			"name": "Blue",
		},
		{
			"hex": "#4b0082",
			"name": "Indigo",
		},
		{
			"hex": "#ee82ee",
			"name": "Purple",
		},
	];

	// from https://stackoverflow.com/a/5624139
	function hexToRgb(hex) {
		var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, function (m, r, g, b) {
			return r + r + g + g + b + b;
		});

		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : null;
	}

	// Distance between 2 colors (in RGB)
	// https://stackoverflow.com/questions/23990802/find-nearest-color-from-a-colors-list
	function distance(a, b) {
		return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2));
	}

	// return nearest color from array
	function nearestColor(colorHex) {
		var lowest = Number.POSITIVE_INFINITY;
		var tmp;
		let index = 0;

		var colorObj = null;

		if (colorHex != null) {
			baseColors.forEach((el, i) => {
				tmp = distance(hexToRgb(colorHex), hexToRgb(el.hex))
				if (tmp < lowest) {
					lowest = tmp;
					index = i;
				};

			})
			colorObj = baseColors[index]
		} else {
			colorObj = options.defaultColor;
		}

		return colorObj;
	}




	return {
		hexToRgb: hexToRgb,
		nearestColor: nearestColor
	}
};
