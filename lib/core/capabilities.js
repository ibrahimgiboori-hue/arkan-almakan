// نموذج قدرات نقي: لا React، لا تفاصيل تخزين، ولا معرفة بالواجهة.

export function normalizeCapabilities(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((item) => item && typeof item === 'object' && item.capability_key)
    .map((item) => ({
      capability_key:String(item.capability_key),
      module_key:item.module_key ? String(item.module_key) : null,
      scope_type:item.scope_type ? String(item.scope_type) : null,
      scope_key:item.scope_key ?? null,
      source_key:item.source_key ?? null,
    }));
}

export function capabilityKeySet(capabilities) {
  return new Set(normalizeCapabilities(capabilities).map((item) => item.capability_key));
}

export function capabilitiesForModule(capabilities, moduleKey) {
  const key = String(moduleKey || '');
  return normalizeCapabilities(capabilities).filter((item) => item.module_key === key);
}

export function hasCapability(capabilities, capabilityKey) {
  return capabilityKeySet(capabilities).has(String(capabilityKey || ''));
}

export function hasModuleCapability(capabilities, moduleKey) {
  return capabilitiesForModule(capabilities, moduleKey).length > 0;
}
