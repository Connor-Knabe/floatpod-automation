function formatChicagoTime(dateOrMs, options = {}) {
  const date = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  return date.toLocaleString('en-US', { timeZone: 'America/Chicago', ...options });
}

module.exports = { formatChicagoTime };
