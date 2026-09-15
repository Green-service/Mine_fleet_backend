export function machineReference(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  // Fleet identifiers can be entered with a separating space; machine names
  // retain readable word spacing when no fleet number is available.
  return /^[A-Z]+\s+\d+$/.test(text) ? text.replace(/\s/g, "") : text;
}

export function machineIdentity(value) {
  return machineReference(value).replace(/\s/g, "");
}
