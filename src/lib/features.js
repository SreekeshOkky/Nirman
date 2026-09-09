export const DEFAULT_FEATURES = {
  audit_log: true,
  categories: true,
  notes: true,
};

export async function loadFeatures(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/features`);
    if (!response.ok) return { ...DEFAULT_FEATURES };
    const data = await response.json();
    return { ...DEFAULT_FEATURES, ...data };
  } catch {
    return { ...DEFAULT_FEATURES };
  }
}

export function isFeatureEnabled(features, name) {
  return Boolean(features?.[name]);
}
