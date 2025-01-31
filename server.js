const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const rateLimit = require('express-rate-limit');
const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // IP başına maksimum istek
});

app.use(limiter);

// CORS ayarları
app.use(cors());

// Güvenlik başlıkları
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// SSL sertifika hatalarını yoksay
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/proxy', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    console.log('Fetching URL:', url);

    const response = await axiosInstance({
      method: 'GET',
      url: url,
      timeout: 30000,
      headers: {
        'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
        'Accept': '*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Connection': 'keep-alive'
      },
      responseType: 'text',
      maxRedirects: 5
    });

    // M3U içerik kontrolü
    const content = response.data;
    const isM3U = content.includes('#EXTINF') || 
                  content.includes('#EXTM3U') || 
                  content.split('\n').some(line => 
                    line.trim().startsWith('http://') || 
                    line.trim().startsWith('https://')
                  );

    if (!isM3U) {
      console.error('Invalid M3U content:', content.substring(0, 200));
      return res.status(400).json({ error: 'Invalid M3U format' });
    }

    res.set('Content-Type', 'text/plain');
    res.send(content);

  } catch (error) {
    console.error('Proxy error:', error.message);
    let errorMessage = 'Failed to fetch playlist';

    if (error.response) {
      errorMessage = `Server returned ${error.response.status}`;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    }

    res.status(500).json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
