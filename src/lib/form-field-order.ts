/**
 * C10: official-form field order for the copy-ready packet.
 * Unknown keys are dropped; missing keys keep today's default order at the end.
 */

export const PACKET_FIELD_KEYS = [
  'full_name',
  'email',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
] as const;

export type PacketFieldKey = (typeof PACKET_FIELD_KEYS)[number];

const ALLOWED = new Set<string>(PACKET_FIELD_KEYS);

export function isPacketFieldKey(value: string): value is PacketFieldKey {
  return ALLOWED.has(value);
}

/** Default packet order when no settlement order is stored or the flag is off. */
export function defaultPacketFieldOrder(): PacketFieldKey[] {
  return [...PACKET_FIELD_KEYS];
}

/**
 * Packet fields in the stored official-form order when the flag is on.
 * Always returns every known field exactly once.
 */
export function packetFieldOrder(
  stored: string[] | null | undefined,
  enabled: boolean,
): PacketFieldKey[] {
  if (!enabled || !stored?.length) return defaultPacketFieldOrder();
  const seen = new Set<PacketFieldKey>();
  const ordered: PacketFieldKey[] = [];
  for (const raw of stored) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim();
    if (!isPacketFieldKey(key) || seen.has(key)) continue;
    ordered.push(key);
    seen.add(key);
  }
  for (const key of PACKET_FIELD_KEYS) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}
