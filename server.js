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

// Keep-alive ve timeout ayarları
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 60000
  }),
  timeout: 60000, // 60 saniye
  maxRedirects: 5,
  validateStatus: function (status) {
    return status >= 200 && status < 600; // default
  }
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

    try {
      const response = await axiosInstance({
        method: 'GET',
        url: url,
        timeout: 60000, // 60 saniye
        headers: {
          'User-Agent': 'VLC/3.0.16 LibVLC/3.0.16',
          'Accept': '*/*',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'Connection': 'keep-alive'
        },
        responseType: 'text',
        maxRedirects: 5,
        decompress: true // GZIP desteği
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      console.log('Response size:', response.data?.length || 0);
      
      if (response.status !== 200) {
        console.error('Non-200 response:', response.status, response.statusText);
        return res.status(response.status).json({ 
          error: `Target server returned ${response.status}`,
          details: response.statusText
        });
      }

      // M3U içerik kontrolü
      const content = response.data;
      if (!content) {
        console.error('Empty response received');
        return res.status(400).json({ error: 'Empty response received' });
      }

      console.log('Content preview:', content.substring(0, 200));

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

      // Cache headers
      res.set({
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=300', // 5 dakika cache
        'Connection': 'keep-alive'
      });
      
      res.send(content);

    } catch (fetchError) {
      console.error('Fetch error details:', {
        message: fetchError.message,
        code: fetchError.code,
        stack: fetchError.stack,
        response: fetchError.response?.status,
        responseData: fetchError.response?.data
      });

      let errorMessage = 'Failed to fetch playlist';
      let statusCode = 500;

      if (fetchError.response) {
        errorMessage = `Target server error: ${fetchError.response.status}`;
        statusCode = fetchError.response.status;
      } else if (fetchError.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out';
        statusCode = 504;
      } else if (fetchError.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused';
        statusCode = 502;
      }

      res.status(statusCode).json({ 
        error: errorMessage,
        details: fetchError.message
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
