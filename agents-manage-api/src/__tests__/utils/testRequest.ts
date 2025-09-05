import app from '../../app.js';

// Helper function to make requests with JSON headers
export const makeRequest = async (url: string, options: RequestInit = {}) => {
  return app.request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};
