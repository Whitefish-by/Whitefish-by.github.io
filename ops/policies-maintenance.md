# Pricing and policy maintenance

Published content lives in `src/pages/{pricing,terms,privacy,refund}.astro`. Shared contact
details and the explicit policy date live in `src/data/policies.ts`. Do not use build time as
the policy revision date. Pricing and the home page support English, Simplified Chinese,
Traditional Chinese, Japanese, Korean, Russian, French and German. The three policy bodies
remain English; links from other languages explicitly label this. English is the root default.
Commercial facts are shared in `src/data/pricing.ts`; translated copy uses placeholders so
prices, allowances and validity periods stay consistent. Translation does not enable checkout.

## Evidence used for the 11 October 2026 version

- Public operator name requested by the owner: PaperEnjoyer. The service is operated by an
  individual in Wuhan, China; correspondence location Huazhong University of Science and
  Technology; whitefisher873@gmail.com. The public name does not assert company registration.
  The university is not described as the business or sponsor. No street address or registration
  number was invented.
- Subscription specification: `Whitefish-by/PaperEnjoyer`,
  `docs/订阅规则文档/订阅规则规范v1.md`, baseline commit `3f2d144`.
  Planned credits are not the current PaperCore Free usage ledger. There is no active
  Lite/Pro checkout or grant engine in this website change.
- Product source: account/cloud sync, `server/src/reading`, credential vault, cloud revision
  storage, MinerU task expiry, standard-reading submissions/review, share snapshots and
  backup scripts in the application repository. New onboarding changes at `f8e4298` ask
  for a sync choice; older versions may enable account sync by default.
- Live backend build: `cd5683cdb28c7fcd2d0d69ac28819b3ff66ffd55`. The deployed manifest's
  293 files were verified. Of 79 project sources embedded in its two entrypoint source maps,
  78 matched the local `d8b8332` sources; the remaining difference was a type-only export
  in `src/shared/reading-jobs.ts`. This is provenance evidence, not a claim that the live
  backend is built from the current GitHub head. No backend rollout is part of these pages.
- Live deployment configuration: Singapore hosting/COS, the mainland-China DashScope
  default endpoint, configured TypeSafe grouping, and separate authentication service.
  Secret values, account data and raw environment files must never be included here.

Official references checked on 11 October 2026:

- [Paddle domain review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification)
- [Paddle Refund Policy](https://www.paddle.com/legal/refund-policy) (dated 31 March 2026)
- [Paddle Buyer Terms](https://www.paddle.com/legal/buyer-terms)
- [Paddle Privacy Policy](https://www.paddle.com/legal/privacy)
- [ICO privacy-information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)

Paddle's discretionary 14-day request period is not a worldwide unconditional refund
guarantee. Regional rights, valid withdrawal exceptions and defect remedies must not be
replaced by a blanket “all sales final” or “any AI usage waives rights” sentence. Credit
corrections and money refunds are separate. Link to the official transaction policies rather
than maintaining a partial country table that can drift.

## Operational matters that page wording does not resolve

These are maintenance items, not claims of completed legal review or Paddle approval:

- Owner to reconfirm the public name, email and a sufficiently complete correspondence
  address before relying on them for formal postal notices or merchant verification.
- Establish and document applicable transfer safeguards/provider agreements, actual
  downstream processing locations and any EU/UK representative obligations for the
  intended markets. Neither SCC coverage nor an adequacy decision was verified; the
  public notice does not claim either. Obtain qualified review of the legal bases,
  standard-reading reuse and international offering where needed.
- Define/enforce backup rotation and deletion propagation. There is no verified universal
  backup expiry or automatic account-erasure workflow. Email requests require operational
  handling; do not promise complete deletion in 24 hours or 30 days.
- Check standard-reading submissions for personal/confidential material and maintain a
  process for objections, removal and recipient copies. The current path can submit
  unedited generated results automatically; do not describe it as a new opt-in control.
- Before payment launch, implement and verify the advertised allocations, promotions,
  billing consent, cancellation, entitlement delivery and refunds. Confirm exactly what
  Paddle checkout is approved to sell. Then revise coming-soon wording and policy dates.
- Revisit privacy text whenever sync defaults, model endpoints, parsing providers, log
  retention, credential handling, sharing or reuse behavior changes.

## Deployment and verification

Builds include `site-build.json` with the source SHA and a dirty-worktree flag. A build
before committing intentionally reports `dirty: true`. A fresh build after a local commit
or from GitHub Actions records the committed source. Do not relabel an uncommitted build
as clean. Confirm the deployed SHA after either manual or automated publication.

The receiver rejects builds missing a home or pricing page in any supported language,
the English policies, compatibility page, sitemap or build metadata. Install the
updated `ops/receive-site.py` with the same owner/mode as the existing receiver. Apply the
English and localized Nginx routes and slash/index redirects, preserving download aliases. Save the
existing config outside the Nginx include directory, run `nginx -t`, then reload. A reload
returns before every old worker exits: retry the origin route checks briefly before
declaring failure or rolling back. Retain the previous release target for atomic rollback.

Run format, Astro, unit, receiver, sync-script, build and Chromium/WebKit checks. After deployment,
check direct 200 responses, HTML content types, canonical links, slash/index redirects,
all language link sets and installer range requests. Verify the final live build metadata;
check GitHub Actions as well when publishing through a push. Do not commit deployment keys
or generated artifacts.
