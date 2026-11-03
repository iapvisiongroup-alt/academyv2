# Kreate Video 2.5

Verified against MuAPI documentation on 2026-11-03:

- https://muapi.ai/playground/seedance-2.5-text-to-video/llms.txt
- https://muapi.ai/playground/seedance-2.5-image-to-video/llms.txt
- https://muapi.ai/playground/seedance-2.5-omni-reference/api
- https://muapi.ai/playground/seedance-2.5-omni-reference (pricing)

The existing models remain available. Select **Kreate Video 2.5** for final
480p output with 5, 10, 15, 20, 25 or 30 seconds. This uses the standard
Seedance 2.5 family, not Spicy, international, or draft-to-1080p variants.

Routing follows the references:

| Input | Private API route | Provider endpoint |
| --- | --- | --- |
| Prompt only | generate/video/v25-text | seedance-2.5-text-to-video |
| One image | generate/video/v25-image | seedance-2.5-image-to-video |
| Multiple images, video or audio | generate/video/v25-reference | seedance-2.5-omni-reference |

Omni sends `images_list` (30 max), `videos_list` (10 max) and `audios_list`
(10 max). The input panel displays their canonical `@image1`, `@video1`
and `@audio1` names and allows removal. The plus button and drop area both
accept references. Videos are restricted to MP4/MOV with a server-readable
duration no longer than 30 seconds each. Audio supports MP3, WAV, M4A and OGG.

## Price

Provider 480p price without video references: USD 0.17 per output second.
With video references: USD 0.17 * 0.65 per second of output plus the duration
of every video reference, including repeated references. Images/audio do not
add video-reference duration to the documented formula.

The price is twice that cost, converted into credits using the cheapest
current package (EUR 69.99 for 10,000 credits) and USD/EUR 0.89158, the latest
ECB-based quote available on 2026-11-03:
https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR

`ceil(providerUSD * 0.89158 * 2 / (69.99 / 10000))`

This is gross revenue before tax and payment fees, not a guarantee of net
profit. Constants are shared between frontend and backend in
`src/lib/kreateVideo25.mjs`. Update the FX snapshot if exchange rates change,
and reprice if MuAPI tariffs or the cheapest credit package change.

Without video references: 5s = 217 CR; 10s = 434 CR; 15s = 650 CR;
20s = 867 CR; 25s = 1083 CR; 30s = 1300 CR.

## Server enforcement

The backend reconstructs the provider body, forces 480p, disables high
bitrate/drafts and strips draft finalization and unknown fields. It checks
session and credit balance before submitting, using the existing atomic
deduction and immediate-failure refund paths.

Video-reference durations are read from MP4/MOV headers during upload and
stored as server-owned Storage metadata. Billing reads that metadata with
the service account and validates bucket and user ownership. Client-supplied
duration/cost fields are ignored. Unknown duration, another user's reference,
an external video URL or an overlong reference fails before credits are spent.

## Verification

`node --test tests/kreate-video25*.test.mjs`

Tests cover payloads, pricing, forced resolution, ownership, invalid duration,
registration/balance gates, immediate refunds and audio upload signatures.
Frontend mock checks exercise text, image and combined-reference submission
at desktop and mobile sizes without a billable provider request.
