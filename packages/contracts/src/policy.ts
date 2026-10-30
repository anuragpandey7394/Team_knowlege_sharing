export const capabilities = ["read", "comment", "edit", "admin"] as const;
export type Capability = (typeof capabilities)[number];
const grants: Record<string, readonly Capability[]> = {
  READER: ["read"],
  REVIEWER: ["read", "comment"],
  EDITOR: ["read", "comment", "edit"],
  ADMIN: ["read", "comment", "edit", "admin"],
};
export function can(role: string, capability: Capability): boolean {
  return (
    Object.hasOwn(grants, role) && (grants[role]?.includes(capability) ?? false)
  );
}
