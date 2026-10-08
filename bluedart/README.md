# Shipment Tracking Proxy

A carrier-agnostic Render proxy for Ship24.

Ship24 identifies the carrier from the tracking number and returns the available shipment tracking data.

## Create a new tracker

GET or POST:

`/trackingId/new/<tracking-number>`

Example:

`/trackingId/new/90691129233`

The response includes the Ship24 `trackerId`.

## Get an existing tracker

GET:

`/trackingId/<trackerId>`

This retrieves the latest results for an existing Ship24 tracker.

## Generic compatibility endpoint

`/whateverrender/<tracking-number>`

This also creates a new Ship24 tracker.

## Render environment variables

- `SHIP24_API_KEY` — Ship24 API key
- `SHIP24_URL` — optional, defaults to `https://api.ship24.com`

The API key is never returned to callers.
