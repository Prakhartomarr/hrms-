import type { InjectionKey } from "vue"

/** Which view a primary button belongs to: "page" by default, each open sheet its own. */
export const PRIMARY_SCOPE: InjectionKey<string> = Symbol("primary-scope")
