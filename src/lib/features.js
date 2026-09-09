export const DEFAULT_FEATURES = {
  audit_log: true,
  categories: true,
  notes: true,
  signup: true,
};

export async function loadFeatures(baseUrl) {
  let serverFlags = {};
  try {
    const response = await fetch(`${baseUrl}/features`);
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === "object") serverFlags = data;
    }
  } catch {
    // API unreachable: keep the default flags.
  }
  return { ...DEFAULT_FEATURES, ...serverFlags };
}

export function isFeatureEnabled(features, name) {
  return Boolean(features?.[name]);
}
