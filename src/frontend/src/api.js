// Data-fetching layer.
//
// Day 1 (no backend yet): VITE_API_BASE_URL is unset -> every call resolves
// against the mock fixtures in mockData.js, with a simulated network delay
// so loading states are exercised honestly during rehearsal.
//
// Day 2 (real backend): set VITE_API_BASE_URL in .env to the backend URL.
// That's the one-line change — every function below switches to real
// fetch() calls automatically, same response shape, nothing else to edit.

import { MOCK_ASSETS, mockExplain, mockDispatchPlan, mockAsk } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const USE_MOCK = !BASE_URL;

const MOCK_DELAY_MS = 500;

// Append ?fail=1 to the page URL during rehearsal to force the error state
// on demand, without touching code.
function shouldSimulateFailure() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('fail') === '1';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json();
}

export async function getAssets() {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return MOCK_ASSETS;
  }
  return request('/assets');
}

export async function getAssetExplanation(assetId) {
  if (USE_MOCK) {
    await delay(350);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return mockExplain(assetId);
  }
  return request(`/assets/${encodeURIComponent(assetId)}/explain`);
}

export async function getDispatchPlan() {
  if (USE_MOCK) {
    await delay(600);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return mockDispatchPlan();
  }
  return request('/plan');
}

export async function askBob(question) {
  if (USE_MOCK) {
    await delay(700);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return { answer: mockAsk(question) };
  }
  return request('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

export const dataSourceIsMock = USE_MOCK;