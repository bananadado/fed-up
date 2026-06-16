#!/usr/bin/env sh
set -eu

# Current moderate/high advisories are transitive dependencies of pinned CI tooling
# such as Vercel CLI and ESLint. Keep the audit gate active for new advisories while
# these upstream packages do not yet resolve to patched transitive versions.
bun audit --audit-level=moderate \
  --ignore GHSA-83g3-92jg-28cx \
  --ignore GHSA-qffp-2rhf-9h96 \
  --ignore GHSA-9ppj-qmqm-q256 \
  --ignore GHSA-v3rj-xjv7-4jmq \
  --ignore GHSA-2g4f-4pwh-qvx6 \
  --ignore GHSA-c76h-2ccp-4975 \
  --ignore GHSA-g9mf-h72j-4rw9 \
  --ignore GHSA-2mjp-6q6p-2qxm \
  --ignore GHSA-vrm6-8vpv-qv8q \
  --ignore GHSA-v9p9-hfj2-hcw8 \
  --ignore GHSA-4992-7rv2-5pvq \
  --ignore GHSA-3ppc-4f35-3m26 \
  --ignore GHSA-7r86-cg39-jmmj \
  --ignore GHSA-23c5-xmqv-rm74 \
  --ignore GHSA-p36q-q72m-gchr \
  --ignore GHSA-9wv6-86v2-598j \
  --ignore GHSA-j3q9-mxjg-w52f \
  --ignore GHSA-27v5-c462-wpq7 \
  --ignore GHSA-w5hq-g745-h8pq \
  --ignore GHSA-ph9p-34f9-6g65 \
  --ignore GHSA-gv7w-rqvm-qjhr \
  --ignore GHSA-vmf3-w455-68vh \
  --ignore GHSA-hmw2-7cc7-3qxx \
  --ignore GHSA-hmw2-7cc7-3qxx \
  --ignore GHSA-f38q-mgvj-vph7 \
  --ignore GHSA-8988-4f7v-96qf \
  --ignore GHSA-h67p-54hq-rp68 \
  --ignore GHSA-wwfh-h76j-fc44 \
  --ignore GHSA-j6c9-x7qj-28xf \
  --ignore GHSA-88fw-hqm2-52qc \
  --ignore GHSA-rv63-4mwf-qqc2 \
  --ignore GHSA-wgpf-jwqj-8h8p
