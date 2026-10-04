/**
 * Credentials minted when a tenant is created.
 *
 * The password is something Frank reads aloud or pastes into an email, so it
 * avoids look-alike characters (0/O, 1/l/I) and is grouped for legibility:
 * `k7mp-x3qa-9fht-2wze`. Sixteen symbols from a 31-character alphabet carry
 * roughly 79 bits of entropy.
 */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_GROUPS = 4;
const PASSWORD_GROUP_LENGTH = 4;

/** Uniform index in `[0, size)` via rejection sampling, so no symbol is favored. */
function randomIndex(size: number): number {
  const limit = 256 - (256 % size);
  const byte = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(byte);
    if (byte[0]! < limit) return byte[0]! % size;
  }
}

export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < PASSWORD_GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < PASSWORD_GROUP_LENGTH; i += 1) {
      group += PASSWORD_ALPHABET[randomIndex(PASSWORD_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** 256-bit hex secret that signs the tenant site's session cookies. */
export function generateSessionSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
