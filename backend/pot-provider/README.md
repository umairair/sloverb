The Docker build fetches BgUtils POT Provider 2.0.2 at commit
`26475e9d3665b972c4aeb83b4dbaafcf64b88438` and checks the commit before building.
The build manifest retains its runtime dependencies, pins the Canvas native
module and includes only the TypeScript compiler and types needed to build it.
Unused lint and SWC tooling is omitted, avoiding platform-specific optional
dependency resolution differences. The lockfile includes compatible security
fixes available November 10, 2026.
`npm ci`, `npx tsc` and `npm audit --omit=dev` passed with this lockfile.

Upstream source and license: https://github.com/Brainicism/bgutil-ytdlp-pot-provider/tree/2.0.2

The generation script runs only as a child of the bounded extractor. No provider
HTTP server is started or exposed. Its cache is temporary, contains guest tokens
and is separate from song files. No account cookies are used.
