import createClient from "openapi-fetch";

import type { components, paths } from "./library-api.d.ts";

/**
 * @deprecated Use createLibraryClient instead.
 */
export const createLibraryClient = createClient<paths>;

export const createLibraryClient = createClient<paths>;

export type LibraryAPISchemas = components["schemas"];
