# HMO Vision AI — API Documentation

## POST /api/upload

Upload a floor-plan image.

### Request

`Content-Type: multipart/form-data`

| Field | Type   | Required | Description                                |
|-------|--------|----------|--------------------------------------------|
| file  | File   | Yes      | Floor-plan image (JPG, PNG, or PDF)        |

**Constraints:**
- Maximum file size: 20 MB (configurable via `MAX_FILE_SIZE_BYTES` env var)
- Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.pdf`
- File magic bytes are validated (no MIME spoofing)
- Filename must not contain path traversal characters (`..`, `/`, `\`)

### Response (200 OK)

```json
{
  "success": true,
  "filename": "3f7a1b2c-0d4e-...-original.jpg"
}
```

### Error Responses

| Status | Condition                                      |
|--------|------------------------------------------------|
| 400    | No file, invalid filename, wrong extension, file too large, magic bytes mismatch |

---

## POST /api/analyse

Run the full HMO analysis pipeline on an uploaded floor plan.

### Request

`Content-Type: application/json`

```json
{
  "filename": "3f7a1b2c-0d4e-...-original.jpg",
  "address": "12 High Street, London, E1 1AA",
  "propertyType": "House"
}
```

| Field        | Type   | Required | Max Length | Description                                |
|--------------|--------|----------|------------|--------------------------------------------|
| filename     | string | Yes      | 300        | Filename returned by `/api/upload`         |
| address      | string | No       | 500        | Property address (used in AI prompt)       |
| propertyType | string | No       | 200        | Property type (used in AI prompt)          |

### Response (200 OK)

```json
{
  "success": true,
  "result": {
    "originalFloorPlan": { ... },
    "proposedFloorPlan": { ... },
    "hmoAnalysis": {
      "summary": {
        "bedrooms": 3,
        "bathrooms": 1,
        "kitchen": true,
        "livingRoom": true,
        "possibleHMOBedrooms": 5,
        "confidence": "High"
      },
      "hmoScore": 78,
      "verdict": "Good HMO conversion potential",
      "highestPossibleHMO": {
        "bedrooms": 5,
        "score": 85,
        "reason": "..."
      },
      "recommendedLayout": [
        {
          "type": "ConvertToBedroom",
          "roomId": "...",
          "description": "Convert living room to bedroom",
          "step": 1
        }
      ],
      "conversionSteps": ["..."],
      "recommendations": ["..."],
      "compliance": ["..."],
      "fireSafety": ["..."],
      "planningRisk": "Low",
      "estimatedConversionCost": {
        "low": 25000,
        "high": 45000
      },
      "estimatedMonthlyRent": 3200,
      "estimatedAnnualRent": 38400,
      "estimatedYield": "8.5%",
      "estimatedROI": "12%",
      "investorSummary": "Strong investment opportunity..."
    },
    "originalLayoutImage": "data:image/svg+xml;base64,...",
    "proposedLayoutImage": "data:image/svg+xml;base64,...",
    "sourceFilename": "3f7a1b2c-...-original.jpg"
  }
}
```

#### `originalFloorPlan` / `proposedFloorPlan` shape

```json
{
  "id": "uuid",
  "floors": [
    {
      "index": 0,
      "label": "Ground Floor",
      "rooms": [
        {
          "id": "uuid",
          "label": "Bedroom",
          "type": "bedroom",
          "bounds": { "x": 10, "y": 10, "width": 200, "height": 150 },
          "areaM2": 12.5,
          "floorIndex": 0,
          "adjacentRoomIds": ["uuid2"],
          "doors": [],
          "windows": [],
          "modified": false
        }
      ],
      "walls": [
        {
          "id": "uuid",
          "start": { "x": 0, "y": 0 },
          "end": { "x": 800, "y": 0 },
          "thickness": 2
        }
      ],
      "yRange": { "top": 0, "bottom": 599 }
    }
  ],
  "metadata": {
    "sourceFilename": "3f7a1b2c-...-original.jpg",
    "imageDpi": 72,
    "imageWidthPx": 800,
    "imageHeightPx": 600,
    "scale": 0.000347,
    "detectedAt": "2026-08-10T12:00:00.000Z"
  }
}
```

### Error Responses

| Status | Condition                                           |
|--------|-----------------------------------------------------|
| 400    | Invalid/missing filename, address/propertyType too long |
| 404    | Uploaded file not found on server                   |
| 429    | Rate limit exceeded (10 requests / 60 seconds)      |
| 504    | AI analysis timed out (> 60 seconds)                |
| 500    | Detection or server error                           |

**Rate limit response headers:**
```
Retry-After: 45
```

### Error response body

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## Rate Limiting

All API routes are subject to in-memory rate limiting:
- **Default:** 10 requests per 60-second window per IP
- **Configurable** via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` environment variables
- Returns `429 Too Many Requests` with a `Retry-After` header when exceeded

---

## Environment Variables

| Variable                  | Default          | Description                          |
|---------------------------|------------------|--------------------------------------|
| `OPENAI_API_KEY`          | *(required)*     | OpenAI API key                       |
| `AI_MODEL`                | `gpt-4.1-mini`   | OpenAI model to use                  |
| `AI_TIMEOUT_MS`           | `60000`          | AI request timeout in ms             |
| `DETECTION_TIMEOUT_MS`    | `30000`          | Detection pipeline timeout in ms     |
| `MAX_FILE_SIZE_BYTES`     | `20971520`       | 20 MB max upload size                |
| `UPLOAD_DIR`              | `uploads`        | Directory for uploaded files         |
| `DARK_PIXEL_THRESHOLD`    | `80`             | Pixel value below which = wall       |
| `MIN_WALL_LENGTH_PX`      | `15`             | Minimum wall segment length          |
| `MIN_ROOM_AREA_PX2`       | `2000`           | Minimum connected region area (px²)  |
| `RATE_LIMIT_MAX`          | `10`             | Max requests per window              |
| `RATE_LIMIT_WINDOW_MS`    | `60000`          | Rate limit window in ms              |
| `LOG_LEVEL`               | `info`           | `debug`, `info`, `warn`, `error`     |
