# Blue Dart Waybill Proxy

GET /whateverrender/:waybill

Example:
GET /whateverrender/90691129233

Render environment variables:
- BLUEDART_API_ID
- BLUEDART_API_KEY
- BLUEDART_JWT_TOKEN
- BLUEDART_FORMAT (optional; defaults to xml)
- BLUEDART_TRACKING_URL (optional; defaults to the official production tracking endpoint)

The proxy never exposes the Blue Dart credentials to the caller.
