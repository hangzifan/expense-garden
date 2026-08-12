# Version history and provenance

Historical commits are chronological, but not every old APK had a complete original source snapshot.
Tags under `archive/` explicitly distinguish reconstructed or build-only states from verified source.

| Version | Date (UTC+8) | Status | Tag |
|---|---|---|---|
| 1.0 | 2026-07-02T00:32:04+08:00 | reconstructed | `archive/v1.0.0-reconstructed` |
| 1.1 | 2026-07-02T23:37:45+08:00 | reconstructed | `archive/v1.1.0-reconstructed` |
| 1.2 | 2026-07-03T00:01:25+08:00 | reconstructed | `archive/v1.2.0-reconstructed` |
| 1.3 | 2026-07-03T00:35:05+08:00 | reconstructed-no-apk | `archive/v1.3.0-reconstructed` |
| 1.4 | 2026-07-03T21:40:58+08:00 | reconstructed-no-apk | `archive/v1.4.0-reconstructed` |
| 1.5 | 2026-07-03T21:47:31+08:00 | reconstructed-no-apk | `archive/v1.5.0-reconstructed` |
| 1.6 | 2026-07-03T22:25:06+08:00 | reconstructed-no-apk | `archive/v1.6.0-reconstructed` |
| 1.7 | 2026-07-03T23:37:53+08:00 | reconstructed-no-apk | `archive/v1.7.0-reconstructed` |
| 1.8 | 2026-07-03T23:46:06+08:00 | reconstructed | `archive/v1.8.0-reconstructed` |
| 1.9 | 2026-07-03T23:54:27+08:00 | reconstructed | `archive/v1.9.0-reconstructed` |
| 1.10 | 2026-07-10T15:25:01+08:00 | reconstructed | `archive/v1.10.0-reconstructed` |
| 1.11 | 2026-07-10T15:48:01+08:00 | reconstructed | `archive/v1.11.0-reconstructed` |
| 1.12 | 2026-07-10T21:59:57+08:00 | reconstructed | `archive/v1.12.0-reconstructed` |
| 1.13 | 2026-07-10T22:23:50+08:00 | reconstructed | `archive/v1.13.0-reconstructed` |
| 1.14 | 2026-07-10T23:10:36+08:00 | reconstructed | `archive/v1.14.0-reconstructed` |
| 1.15 | 2026-07-10T23:31:21+08:00 | reconstructed | `archive/v1.15.0-reconstructed` |
| 1.16 | 2026-07-12T22:03:06+08:00 | reconstructed | `archive/v1.16.0-reconstructed` |
| 1.17 | 2026-07-12T22:29:09+08:00 | reconstructed | `archive/v1.17.0-reconstructed` |
| 1.18 | 2026-07-13T19:49:55+08:00 | reconstructed | `archive/v1.18.0-reconstructed` |
| 1.19 | 2026-07-14T19:12:23+08:00 | reconstructed | `archive/v1.19.0-reconstructed` |
| 1.20 | 2026-07-14T19:50:10+08:00 | reconstructed | `archive/v1.20.0-reconstructed` |
| 1.21 | 2026-07-14T20:03:14+08:00 | reconstructed | `archive/v1.21.0-reconstructed` |
| 1.22 | 2026-07-18T11:56:36+08:00 | build-only | `archive/v1.22.0-build-only` |
| 1.23 | 2026-07-18T12:03:56+08:00 | build-only | `archive/v1.23.0-build-only` |
| 1.24 | 2026-07-18T12:39:27+08:00 | build-only | `archive/v1.24.0-build-only` |
| 1.25 | 2026-07-19T01:24:13+08:00 | build-only | `archive/v1.25.0-build-only` |
| 1.26 | 2026-07-19T19:48:08+08:00 | build-only | `archive/v1.26.0-build-only` |
| 1.27 | 2026-07-21T13:27:27+08:00 | functional-reconstruction | `archive/v1.27.0-reconstructed` |
| 1.28 | 2026-07-27T08:48:24+08:00 | functional-reconstruction | `archive/v1.28.0-reconstructed` |
| 1.29 | 2026-07-28T11:29:44+08:00 | verified-web-source | `v1.29.0` |
| 1.30 | 2026-07-30T00:41:15+08:00 | functional-reconstruction | `archive/v1.30.0-release-reconstructed` |
| 1.30-pre-v131 | 2026-08-10T00:53:26+08:00 | partial-source-snapshot | `archive/v1.30.0-pre-v131-source` |
| 1.31 | 2026-08-10T01:37:27+08:00 | functional-reconstruction | `archive/v1.31.0-reconstructed` |
| 1.32 | 2026-08-11T14:45:02+08:00 | functional-reconstruction | `archive/v1.32.0-reconstructed` |
| 1.33 | 2026-08-11T17:23:57+08:00 | functional-reconstruction | `archive/v1.33.0-reconstructed` |
| 1.34 | 2026-08-11T22:39:54+08:00 | functional-reconstruction | `archive/v1.34.0-reconstructed` |
| 1.35 | 2026-08-12T14:33:14+08:00 | exact-current-source | `v1.35.0-preview` |

## Binary policy

Historical APKs are not committed because they total more than 1 GB and are debug-signed. The manifest
records their local filenames, sizes and SHA-256 hashes. v1.22-v1.26 compiled web payloads are retained
under `history/recovered-builds/` because the corresponding JSX changes are unavailable.

Debug certificate SHA-256: `d59b3a1516ce044d6fb75af2337ea8d72afd07c221ddb364266c3ecc35dadacb`.
These archived APKs are not production releases.
