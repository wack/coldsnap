// Every test runs against the in-memory doubles and an in-memory PGlite
// database; nothing reaches Vercel, Blob, the AI Gateway, or a browser.
process.env.COLDSNAP_DRIVERS = "memory";
process.env.COLDSNAP_PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
delete process.env.COLDSNAP_ROOT_DOMAIN;
