const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const app = express();

app.use(cors());

// SSL sertifika hatalarını yoksay
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
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
        'Accept-Language': 'tr-TR,tr;q=0.9'
      },
      responseType: 'text'
    });

    if (!response.data) {
      throw new Error('Empty response received');
    }

    res.set('Content-Type', 'text/plain');
    res.send(response.data);

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
