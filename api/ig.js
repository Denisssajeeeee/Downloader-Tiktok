// api/ig.js — Vercel Serverless Function (Node.js runtime)
// Otomatis jadi endpoint: https://domain-lo.vercel.app/api/ig?url=...

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function extractShortcode(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function fetchMedia(shortcode) {
  // Coba endpoint GraphQL publik
  try {
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'X-IG-App-ID': '936619743392459'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const media = data?.graphql?.shortcode_media || data?.items?.[0];
      if (media) return media;
    }
  } catch (_) {}

  // Fallback: scrape HTML
  const htmlRes = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' }
  });
  if (!htmlRes.ok) throw new Error(`IG HTML ${htmlRes.status}`);
  const html = await htmlRes.text();

  const videoMatch = html.match(/"video_url":"([^"]+)"/);
  const imageMatch = html.match(/"display_url":"([^"]+)"/);
  const authorMatch = html.match(/"username":"([^"]+)"/);
  const captionMatch = html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]*)"/);

  if (!videoMatch && !imageMatch) {
    throw new Error('Media tidak ditemukan (post private / butuh login)');
  }

  return {
    is_video: !!videoMatch,
    video_url: videoMatch ? videoMatch[1].replace(/\\u0026/g, '&') : null,
    display_url: imageMatch ? imageMatch[1].replace(/\\u0026/g, '&') : null,
    owner: { username: authorMatch ? authorMatch[1] : '-' },
    edge_media_to_caption: { edges: [{ node: { text: captionMatch ? captionMatch[1] : '' } }] }
  };
}

module.exports = async function handler(req, res) {
  // CORS — aman-aman aja walau same-domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const target = req.query?.url;
  if (!target) {
    return res.status(400).json({ error: 'Parameter url wajib diisi' });
  }

  const shortcode = extractShortcode(target);
  if (!shortcode) {
    return res.status(400).json({ error: 'URL Instagram tidak valid' });
  }

  try {
    const media = await fetchMedia(shortcode);
    const isVideo = !!media.is_video || !!media.video_url;
    const videoUrl = media.video_url || media.video_versions?.[0]?.url || null;
    const thumbUrl = media.display_url || media.thumbnail_url || null;
    const author = media.owner?.username || media.user?.username || '-';
    const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || media.caption?.text || '';

    return res.status(200).json({
      ok: true,
      type: isVideo ? 'video' : 'image',
      shortcode,
      author,
      caption,
      thumbnail: thumbUrl,
      video_url: videoUrl
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};