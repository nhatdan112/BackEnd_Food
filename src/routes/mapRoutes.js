
const express = require('express');

const router = express.Router();

const MAP_PROVIDER = (
  process.env.MAP_PROVIDER || 'carto'
).trim().toLowerCase();

const CARTO_API_KEY = process.env.CARTO_API_KEY;
const MAPTILER_API_KEY = process.env.MAPTILER_API_KEY;

const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';

// Transparent 1x1 PNG.
// MapTiler Hybrid đã có nhãn, không cần thêm overlay CARTO.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  'base64'
);

const ALLOWED_LAYERS = [
  'standard',
  'satellite',
  'satellite-labels',
  'terrain',
];

function validateTile(z, x, y) {
  const zoom = Number(z);
  const tileX = Number(x);
  const tileY = Number(y);

  if (
    !Number.isInteger(zoom) ||
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    zoom < 0 ||
    zoom > 22
  ) {
    return false;
  }

  const max = 2 ** zoom;

  return (
    tileX >= 0 &&
    tileY >= 0 &&
    tileX < max &&
    tileY < max
  );
}

function buildUpstreamUrl(layer, z, x, y) {
  if (MAP_PROVIDER === 'maptiler') {
    if (!MAPTILER_API_KEY) {
      throw new Error('MAPTILER_API_KEY is missing in backend .env');
    }

    const mapIds = {
      standard: 'streets-v2',
      satellite: 'hybrid',
      terrain: 'outdoor-v2',
    };

    if (layer === 'satellite-labels') {
      return null;
    }

    const mapId = mapIds[layer];

    if (!mapId) {
      throw new Error('Unsupported MapTiler layer');
    }

    const url = new URL(
      `https://api.maptiler.com/maps/${mapId}/${z}/${x}/${y}.png`
    );

    url.searchParams.set('key', MAPTILER_API_KEY);

    return url.toString();
  }

  if (MAP_PROVIDER === 'carto') {
    if (
      layer === 'standard' ||
      layer === 'satellite-labels'
    ) {
      if (!CARTO_API_KEY) {
        throw new Error('CARTO_API_KEY is missing in backend .env');
      }

      const style =
        layer === 'standard'
          ? 'rastertiles/voyager'
          : 'dark_only_labels';

      const url = new URL(
        `https://basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`
      );

      url.searchParams.set('key', CARTO_API_KEY);

      return url.toString();
    }

    if (layer === 'satellite') {
      // ArcGIS REST tile path uses z/y/x, not z/x/y.
      return (
        'https://server.arcgisonline.com/ArcGIS/rest/services/' +
        'World_Imagery/MapServer/tile/' +
        `${z}/${y}/${x}`
      );
    }

    if (layer === 'terrain') {
      return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`;
    }
  }

  throw new Error(`Unsupported map provider: ${MAP_PROVIDER}`);
}

router.get('/tiles/:layer/:z/:x/:y.png', async (req, res) => {
  const { layer, z, x, y } = req.params;

  if (!ALLOWED_LAYERS.includes(layer)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid map layer',
    });
  }

  if (!validateTile(z, x, y)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid tile coordinates',
    });
  }

  try {
    const upstreamUrl = buildUpstreamUrl(
      layer,
      Number(z),
      Number(x),
      Number(y)
    );

    // MapTiler Hybrid already includes map labels.
    if (!upstreamUrl) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', CACHE_CONTROL);
      return res.status(200).send(TRANSPARENT_PNG);
    }

    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
        'User-Agent': 'FoodFinder/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      console.error(
        `[MapProxy] ${MAP_PROVIDER}/${layer}: upstream HTTP ${upstream.status}`
      );

      // Do not expose upstream URL or API key to the client.
      return res.status(upstream.status).json({
        success: false,
        message: 'Map tile provider request failed',
        provider: MAP_PROVIDER,
        layer,
        upstreamStatus: upstream.status,
      });
    }

    const contentType =
      upstream.headers.get('content-type') || '';

    if (!contentType.startsWith('image/')) {
      console.error(
        `[MapProxy] Unexpected content type: ${contentType}`
      );

      return res.status(502).json({
        success: false,
        message: 'Map provider returned an invalid tile',
      });
    }

    const imageBuffer = Buffer.from(
      await upstream.arrayBuffer()
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.status(200).send(imageBuffer);
  } catch (error) {
    console.error('[MapProxy] Error:', error.message);

    return res.status(502).json({
      success: false,
      message: 'Unable to load map tile',
    });
  }
});

module.exports = router;
