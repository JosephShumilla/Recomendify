import { spawnSync } from 'node:child_process';
import path from 'node:path';

const BACKEND_RUNNER = path.join(__dirname, 'backend', 'run_recommendation.py');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  if (!payload.data) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Playlist link is required' }),
    };
  }

  const pythonResult = spawnSync('python3', [BACKEND_RUNNER], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env },
  });

  if (pythonResult.error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Python execution failed: ${pythonResult.error.message}` }),
    };
  }

  if (pythonResult.status !== 0) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: pythonResult.stderr || 'Backend error' }),
    };
  }

  try {
    const data = JSON.parse(pythonResult.stdout || '{}');
    if (data.error) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify(data) };
    }
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unable to parse backend response' }),
    };
  }
};
