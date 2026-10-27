// The Node profile has no Worker bindings. Expose only the map configuration
// consumed by the existing routes; do not emulate D1, R2 or connector access.
const names = ["PHOTON_API_URL", "PHOTON_REVERSE_API_URL", "OVERPASS_API_URL", "SHOP_DATA_PROVIDER"];
export const env = Object.freeze(Object.fromEntries(names.map((name) => [name, process.env[name]])));
