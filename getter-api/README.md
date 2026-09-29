# Getter / Setter API

`POST /writeSomething` with header `x-password: <SETTER_PASSWORD>` and JSON `{ "stuff": ..., "type": "json|string|...", "id": "..." }`.

`GET /getSomething/:id` with header `x-password: <GETTER_PASSWORD>` returns the stored `stuff` unchanged.

Storage uses Render Key Value via `REDIS_URL`.
