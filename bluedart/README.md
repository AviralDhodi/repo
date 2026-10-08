# Ship24 Waybill Proxy

This Render service wraps the Ship24 Tracking API.

## Create a new tracker

GET or POST:

`/trackingId/new/<tracking-number>`

Example:

`/trackingId/new/90691129233`

The response includes the Ship24 `trackerId`. Save that ID.

Ship24's `POST /trackers/track` endpoint is used so the first call can return tracking results immediately.

## Get an existing tracker

GET:

`/trackingId/<trackerId>`

This calls Ship24's `GET /trackers/:trackerId/results` endpoint.

## Compatibility endpoint

`/whateverrender/<tracking-number>` is also supported and behaves like creating a new tracker.

## Render environment variables

- `SHIP24_API_KEY` — Ship24 API key
- `SHIP24_URL` — optional, defaults to `https://api.ship24.com`

The API key is never returned to callers.

Ship24 requires an active plan; its documentation currently states that a free plan is available for integration/testing. 
