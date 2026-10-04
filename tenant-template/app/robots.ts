/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 * The site is private to one lead, so nothing should be indexed.
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
